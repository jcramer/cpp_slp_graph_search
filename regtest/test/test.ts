import { step } from 'mocha-steps';
import * as assert from "assert";

import { GrpcClient } from "grpc-bchrpc-node";
import { GraphSearchClient } from "grpc-graphsearch-node";
const rpcClient = require('bitcoin-rpc-promise');

const bchd1Grpc = new GrpcClient({ url: "localhost:18335", rootCertPath: "./rpc.bchd1.cert" });
const gsGrpc = new GraphSearchClient({ url: "localhost:50051" });
const bch2Rpc = new rpcClient('http://bitcoin:password@0.0.0.0:18334');

describe("network health check", () => {

    step("bchd1", async () => {
        const info = await bchd1Grpc.getBlockchainInfo();
        assert.strictEqual(info.getBitcoinNet(), 1);
    });

    step("gs++", async () => {
        const status = await gsGrpc.getStatus();
        const height = status.getBlockHeight();
        console.log(height);
        assert.ok(height >= 0);
    });

    step("bchd2", async () => {        
        let res = await bch2Rpc.getPeerInfo();
        assert.strictEqual(typeof res, "object");

        if (res.length < 1) {
            await bch2Rpc.addNode("bchd1", "onetry");
            res = await bch2Rpc.getPeerInfo();
        }

        assert.strictEqual(res.length, 1);
    });
});

describe("basic tests", async () => {
    step("generate block to address", async () => {
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
