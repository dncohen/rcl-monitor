#!/usr/bin/env node

/**
 * This is meant to serve as an example of the usage of the
 * rcl-monitor library.  This program monitors the Ripple Consensus
 * Ledger for activity affecting one or more addresses.  When activity
 * is detected, it will save the details of the transaction to a file,
 * and print to stdout a short message.
 *
 * The behavior could be modified to, say, send an email when activity
 * is detected.
 *
 * The details of the transaction are saved to disk for two reasons.
 * One is to create a permanent record of the transaction which can be
 * persisted for longer than rippled is configured to preserve
 * transaction history.  The second is that this program uses the
 * existance of the file to determine whether it has seen the
 * transaction before (i.e. an earlier execution).  The rationale is
 * that this program can be stopped and restarted and still log all
 * activity, so long as the gap between stop and restart is shorter
 * than rippled's transaction history.
 */

// debug output
var debug = require('debug')('bin/rcl-monitor');

var path = require('path');
var programName = path.basename(process.argv[1]).split('.')[0]; // I.e. "rcl-monitor"

var fs = require('fs');
var ini = require('ini');
var sprintf = require("sprintf-js").sprintf,
    vsprintf = require("sprintf-js").vsprintf

var confFile = path.normalize(path.dirname(process.argv[1]) + '/../conf/' + programName + '.conf');
debug("reading configuration file ", confFile);
// Read command line args.
var commander = require('commander');

commander
  .usage('[options] <account> [otherAccounts]')
  .option('-c, --conf <configuration file>', 'Use configuration file instead of ' + confFile + '.')
  .option('-a, --altnet', 'Use the altnet instead of live network.')
  .parse(process.argv);

if (commander.conf) {
  confFile = commander.conf;
}

var conf = ini.parse(fs.readFileSync(confFile, 'utf-8'));

//console.log(conf); //debug


if (commander.altnet) {
  // Override normal settings, use altnet instead.
  for (var key in conf['altnet']) {
    conf[programName][key] = conf['altnet'][key];
  }
}

// Ensure that we have one or more addresses to monitor.
if (commander.args.length == 0) {
  //debug(formatJSON(conf[programName]));
  if (conf[programName].hasOwnProperty('addresses')) {
    commander.args = conf[programName]['addresses'];
  }
  else {
    console.error("You must specify one or more addresses to monitor.");
    process.exit(1);
  }
}
else {
  debug("Starting rcl-monitor, attempting to watch " + commander.args.length + " addresses.");
}

// rcl-monitor is a wrapper around ripple-lib.  It emits the same
// ledger events, but also emits address-specific events.
const RCLMonitor = require('../lib/rcl-monitor.js').RCLMonitor;

const rcl = new RCLMonitor({
  server: conf[programName]['rippled']
});

debug("Connecting to " + conf[programName]['rippled'] + "...");

rcl.on('error', (errorCode, errorMessage, data) => {
  console.error("RCLMonitor emmitted error.  " + errorCode + ': ' + errorMessage);
  debug(data);
});

rcl.on('connected', info => {
  //debug("connected");
  debug(info);
});


rcl.on('ledger', ledger => {
  //debug("got a ledger");
  //debug(ledger);
});

/** 
 * Maintain a list of tx per ledger.  This will help us keep track of
 * whether this is the first time we've seen a transaction.
 */
var txByLedger = {};

/**
 * RCLMonitor emits ledger_processed after it has emitted events
 * related to a specific ledger.
 */
rcl.on('ledger_processed', ledger => {
  // Find all transactions for this ledger, or earlier.
  for (var ledgerVersion in txByLedger) {
    // Skip properties from prototype.  Ah, javascript.
    if (!txByLedger.hasOwnProperty(ledgerVersion)) continue;

    // Make sure we have integers an not strings.  (we do)
    //debug(ledgerVersion);
    //debug(ledger);
    
    if (ledgerVersion <= ledger['ledgerVersion']) {
      for (var txid in txByLedger[ledgerVersion]) {
        if (!txByLedger[ledgerVersion].hasOwnProperty(txid)) continue;

        var tx = txByLedger[ledgerVersion][txid];
        // Save the tx to a file.  This provides a local record of the tx, and we will use it to detect that we have already processed it.
        // TODO: make file optional - if not in conf.
        var filename = sprintf(conf[programName]['tx_filename_format'], tx);
        fs.writeFile(filename, formatJSON(tx), function (err) {
          if (err) {
            console.error("Failed to write " + filename);
            console.error(err);
          }
          else {
            debug("Wrote transaciton file " + filename);
          }
        });


        // We're done processing this transaction.  Clean up our txByLedger data.
        delete txByLedger[ledgerVersion][txid];
        if (Object.keys(txByLedger[ledgerVersion]) === 0) {
          delete txByLedger[ledgerVersion];
        }
        
      }
    }
  }
  
});

var fs = require('fs');

// Subscribe to the addresses we are interested in.
for (var i = 0; i < commander.args.length; i++) {
  debug(commander.args[i]);
  var address = commander.args[i];
  rcl.addAddress(address);
  rcl.on(address, (tx, addressEffected) => {
    //debug(commander.args[i] + " tx:");
    //debug(tx);

    var filename = sprintf(conf[programName]['tx_filename_format'], tx);

    try {
      var stat = fs.statSync(filename);
      if (stat.isFile()) {
        debug("tx " + filename + " already saved.");
      }
      // The file exists.  Consider it already monitored.  Nothing to do.
      return;
    }
    catch(err) {
      // This means the file does not exist, implying we have not processed the transaction already.  Let's add it to our list, and we will process it.
      var txLedger = tx['outcome']['ledgerVersion'];
      var txid = tx['id'];
      if (!txByLedger.hasOwnProperty(txLedger)) {
        txByLedger[txLedger] = {};
      }
      if (!txByLedger[txLedger].hasOwnProperty(txid)) {
        debug("seeing tx " + txid + " for the first time.");
        txByLedger[txLedger][txid] = tx;
      }
    }

    // We are seeing this tx for the first time, process it.
    // In our case, processing is just a log message.
    if (addressEffected == tx['address']) {
      console.log("%s %s.%s %s %s %s by %s", tx['outcome']['timestamp'], tx['outcome']['ledgerVersion'], tx['outcome']['indexInLedger'], tx['outcome']['result'], txid, tx['type'], formatAddress(tx['address']));
    }
    else {
      console.log("%s %s.%s %s %s %s by %s affected %s", tx['outcome']['timestamp'], tx['outcome']['ledgerVersion'], tx['outcome']['indexInLedger'], tx['outcome']['result'], txid, tx['type'], formatAddress(tx['address']), formatAddress(addressEffected));
    }

  });
}

// Here's where we connect to rippled and start listening.
rcl.connect().then(() => {
  debug('Connected and waiting for RCL events.');
}).then(() => {
  //debug("Disconnecting...");
  //return rcl.disconnect();
}).catch((err) => {
  console.error("Failed to connect: " + err);
  // I'm not sure RCLMonitor gives up entirely here.  It might eventually connect.  But choosing to exit anyway.
  process.exit(1);
});


/**
 * For displaying ripple addresses.  Show a nickname, if known.
 */
function formatAddress(address) {
  if (conf.hasOwnProperty(address)) {
    if (conf[address].hasOwnProperty('nickname')) {
      return conf[address]['nickname'] + ":" + address;
    }
  }
  return address;
}

/**
 * Render JSON consistantly.
 */
function formatJSON(json) {
  return JSON.stringify(json, null, 2);
}

debug("End index.js");


