#!/bin/bash

# set env vars
export BCHD_ADDR=`dig +short bchd1 | tail -n1`
export BCHD_CERT_PATH=/data/rpc.bchd1.cert

# replace env var flags
envsubst < /home/config.regtest.toml > /home/config.toml
cat /home/config.toml

# run gs++ with config
/home/cpp_slp_graph_search/_build/bin/gs++ /home/config.toml
