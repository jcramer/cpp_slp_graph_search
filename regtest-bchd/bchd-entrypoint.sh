#!/bin/bash

# remove previous generated key-pair (this is for bchd1)
rm /data/rpc.*

# start bchd
bchd --regtest --addrindex --txindex --notls -C /data/bchd.conf --miningaddr $1
