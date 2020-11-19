#!/bin/bash

# start bchd
bchd --regtest --addrindex --txindex --notls -C /data/bchd.conf --miningaddr $1
