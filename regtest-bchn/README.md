# BCHN regtest network

Testing for gs++ using json-rpc connection to BCHN.

### Known Bugs:

1. Sometimes graph returned by gs++ is not complete.

2. Observed a SEG once on large block with lots of zmq notifications.  Missing mutex?


### Testing Notes

1. Gs++ txid graph look up time is increasing.
    - 100 txns depth  = <1 ms
    - 900 txns depth  = ~5 ms
    - 3200 txns depth = ~15 ms
2. ....

### Useful Docker Comands:

Start/Stop:
`$ docker-compose up -d`
`$ docker-compose down`

View logs: 
`$ docker logs regtest-bchn_graphsearch_1 -f --tail 1000`
`$ docker logs regtest-bchn_bitcoind1_1 -f --tail 1000`
`$ docker logs regtest-bchn_bitcoind2_1 -f --tail 1000`

Attach shell:
`$ docker exec -it regtest-bchn_graphsearch_1 bash`
`$ docker exec -it regtest-bchn_bitcoind1_1 bash`
`$ docker exec -it regtest-bchn_bitcoind2_1 bash`
