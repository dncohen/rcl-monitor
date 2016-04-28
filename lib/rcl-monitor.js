'use strict';

/**
 * This library builds on ripple-lib, and adds address-specific
 * events.  So, if you're interested in any activity that affects a
 * specific address on the Ripple Consensus Ledger, this library will
 * notify your code of those transactions.
 *
 * Note this uses ripple-lib to connect to a rippled node.  Each
 * rippled is configured to maintain a limited amount of history.  You
 * will only be notified of transactions for some portion of that
 * history, and then all transactions going forward.
 */

const RippleAPI = require('ripple-lib').RippleAPI;

const EventEmitter = require('events').EventEmitter;

// debug output
var debug = require('debug')('lib/rcl-monitor.js');

class RCLMonitor extends EventEmitter {

  addAddress(address) {
    this._addresses[address] = {
      address: address,
      minLedger: 1,
    };
  }

  // Options are passed on to RippleAPI constructor.
  constructor(options) {
    super();

    this._addresses = {};
    this._lastSeenLedger = 1; // Min ledger must be >= 1.
    this._serverInfo = {};

    this._minLedger = 1;

    this._ripple = new RippleAPI(options);
    this._ripple.on('ledger', ledger => {
      this.emit('ledger', ledger);
      this._lastSeenLedger = ledger['ledgerVersion'];

      var me = this;
      Promise.all(Object.keys(this._addresses).map(function(address) {
        var addressData = me._addresses[address];
        debug(address);
        debug(addressData);
        var options = {
          binary: false,
          earliestFirst: true,
          excludeFailures: false,
          minLedgerVersion: Math.max(addressData['minLedger'], me._minLedger),
          maxLedgerVersion: ledger['ledgerVersion']
        };

        debug(options);
        return me._ripple.getTransactions(address, options).then(txs => {
          debug("found " + txs.length + " txs for " + address + " in ledgers up to " + ledger['ledgerVersion']);
          //debug(txs);
          for (var i = 0; i < txs.length; i++) {
            me.emit(address, txs[i], address);
          }

          me._addresses[address]['minLedger'] = ledger['ledgerVersion'];
          debug(me._addresses[address]);
        }).catch(console.error);
      })); // End Promise.all()

      // Emit an event at the end of per-ledger loop.  This doesn't
      // actually mean all our listeners have completed all their own
      // processing.  But it provides a useful signal they can use to
      // clean up after whatever they are doing in response to the
      // ledger event.
      this.emit('ledger_processed', ledger);
    });

    this._ripple.on('error', (errorCode, errorMessage, data) => {
      this.emit('error', errorCode, errorMessage, data);
    });

    this._ripple.on('connected', () => {
      this._ripple.getServerInfo().then(info => {
        //debug(info);
        this._serverInfo = info;
        this.emit('connected', info);

        var completeLedgers = info['completeLedgers'];
        var chunks = completeLedgers.split(',');
        var range = chunks[chunks.length-1].split('-');

        // Note the range currently in rippled is not guaranteed to
        // last.  It could be cut in half any moment.  So let's pick a
        // relatively safe value to use as our minimum.
        this._minLedger = Math.ceil((parseInt(range[0]) + parseInt(range[1])) / 2);

      });
    });

    this._ripple.on('disconnected', code => {
      this.emit('disconnected', code);
    });

  }

  connect() {
    return this._ripple.connect();
  }
  disconnect() {
    return this._ripple.connect();
  }

}

module.exports = {
  RCLMonitor
};
