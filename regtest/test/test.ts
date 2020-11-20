import { step } from 'mocha-steps';
import * as assert from "assert";

import { GrpcClient } from "grpc-bchrpc-node";
// import { GraphSearchClient } from "grpc-graphsearch-node";
import { PrivateKey, Networks } from "bitcore-lib-cash";
import * as bchaddrjs from "bchaddrjs-slp";

const bchd1Grpc = new GrpcClient({ url: "localhost:18335", rootCertPath: "./rpc.bchd1.cert" });
// const gsGrpc = new GraphSearchClient({ url: "localhost:50051" });
const rpcClient = require('bitcoin-rpc-promise');
const bch2Rpc = new rpcClient('http://bitcoin:password@0.0.0.0:18334');

describe("network health check", () => {

    step("bchd1 ready", async () => {
        const info = await bchd1Grpc.getBlockchainInfo();
        assert.strictEqual(info.getBitcoinNet(), 1);
    });

    // step("gs++ ready (connected to bchd1)", async () => {
    //     const status = await gsGrpc.getStatus();
    //     const height = status.getBlockHeight();
    //     //console.log(height);
    //     assert.ok(height >= 0);
    // });

    step("bchd2 ready (connected to bchd1)", async () => {        
        let res = await bch2Rpc.getPeerInfo();
        assert.strictEqual(typeof res, "object");

        if (res.length < 1) {
            await bch2Rpc.addNode("bchd1", "onetry");
            res = await bch2Rpc.getPeerInfo();
        }

        assert.ok(res.length == 1);
    });
});

const privKey1 = new PrivateKey("cPgxbS8PaxXoU9qCn1AKqQzYwbRCpizbsG98xU2vZQzyZCJt4NjB", Networks.testnet);
const wallet1 = {
    _privKey: privKey1,
    address: bchaddrjs.toRegtestAddress(privKey1.toAddress().toString()),
    wif: privKey1.toWIF(),
    pubKey: privKey1.toPublicKey()
};

describe("basic tests", async () => {
    step("generate block to address", async () => {

        let res = await bch2Rpc.generate(1);
        res = await bch2Rpc.generate(1);
        res = await bch2Rpc.generate(1);

        console.log(res);
        // todo...
        assert.ok(0);
    });

    step("submit an slp genesis transaction", async () => {
        // todo...
        assert.ok(0);
    });

    step("submit an slp send transaction", async () => {
        // todo...
        assert.ok(0);
    });

    step("submit an slp mint transaction", async () => {
        // todo...
        assert.ok(0);
    });
});
