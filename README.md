# Ripple Consensus Ledger Monitor

## lib/rcl-monitor.js

Provides a wrapper around ripple-lib, and emits additional
account-specific events.  So you can subscribe to a specific account,
and get an event whenever a transaction affects that account.

This is a rough, early version.  The interface is going to change!

## bin/rcl-monitor.js

The binary is an example of how the library can be used to log
activity of one or more Ripple wallets.

Currently it saves transactions to /tmp and writes no logs, only debug output.  Soon to change.

Usage example:

```
DEBUG=* bin/rcl-monitor.js raDK34VShinWDQBXQctmr8Ck87SUTPsL2A rLWdQ7FayHLH8zs5zn4r2PKmsHP3DR8F6i
```

