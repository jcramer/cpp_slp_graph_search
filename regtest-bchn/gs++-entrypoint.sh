#!/bin/bash

# set env vars
export BITCOIND_ADDR=`dig +short bitcoind1 | tail -n1`
export BCHD_ADDR=""
export BCHD_CERT_PATH=""
export USE_BCHD_GRPC=false
export USE_BITCOIND_ZMQ=true

# replace env var flags
envsubst < /home/config.regtest.toml > /home/config.toml
cat /home/config.toml

# run gs++ with config
/home/cpp_slp_graph_search/_build/bin/gs++ /home/config.toml
