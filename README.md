# Ripple Consensus Ledger Monitor

## lib/rcl-monitor.js

Provides a wrapper around ripple-lib, and emits additional
account-specific events.  So you can subscribe to a specific account,
and get an event whenever a transaction affects that account.

This is a rough, early version.  When more stable, I will bump version to 1.x.

## bin/rcl-monitor.js

The binary is an example of how the library can be used to log
activity of one or more Ripple wallets.

Currently it saves transactions to file and writes only basic log messages.

Usage example:

```
DEBUG=* bin/rcl-monitor.js <address> [<addresses>...]
```

