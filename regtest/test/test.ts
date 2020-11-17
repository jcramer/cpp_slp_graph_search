import { GrpcClient } from "grpc-bchrpc-node";
import { GraphSearchClient } from "grpc-graphsearch-node";
import { step } from 'mocha-steps';
import * as assert from "assert";

const bchd1 = new GrpcClient({ url: "localhost:18335", rootCertPath: "./rpc.bchd1.cert" });
const gs = new GraphSearchClient({ url: "localhost:50051" });
const bchd2 = new GrpcClient({ url: "localhost:18336", rootCertPath: "./rpc.bchd2.cert" });

describe("network health check", () => {
    step("bchd1", async () => {
        const info = await bchd1.getBlockchainInfo();
        assert.strictEqual(info.getBitcoinNet(), 1);
    });
    step("gs++", async () => {
        const status = await gs.getStatus();
        const height = status.getBlockHeight(); 
        console.log(height);
        assert.ok(height);
    });
    step("bchd2", async () => {
        const info = await bchd2.getBlockchainInfo();
        assert.strictEqual(info.getBitcoinNet(), 1);
    });
});

