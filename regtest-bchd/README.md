# regtest testing network

The following commands will create a regtest network with two BCHD full nodes and an instance of gs++.

```
$ docker-compose up -d
$ npm i
$ npm test
```
NOTE: If you need to restart gs++ container, for some unknown reason you have to `docker-compose down` and delete rpc.*.cert files before each `docker-compose up -d`.
