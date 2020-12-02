/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { step } from 'mocha-steps';
import * as assert from "assert";
import * as zmq from 'zeromq';
import { GraphSearchClient } from "grpc-graphsearch-node";
import { BigNumber } from "bignumber.js";
import { BitcoinRpcClient, getScriptPubKey, RpcWalletClient, sleep } from './helpers/rpcwallet';
import { Crypto } from "slp-validate";

// rpc clients for talking to the two full nodes
const rpcClient = require('bitcoin-rpc-promise');  // TODO: create a new typed version of this library with SLPDB patch applied for missing commands
const bchnRpc1 = new rpcClient('http://bitcoin:password@0.0.0.0:18443') as BitcoinRpcClient;
const bchnRpc2 = new rpcClient('http://bitcoin:password@0.0.0.0:18444') as BitcoinRpcClient;

// graphsearch client (will be connecting to bitcoind1, see docker-compose.yml)
const gsGrpc = new GraphSearchClient({ url: "localhost:50051", notls: true });

// stubs for the different wallets.
let wallet1: RpcWalletClient;
let wallet2: RpcWalletClient;

// stubs for slp token info
let tokenId1: string;
// let tokenId2: string;

// gs++ zmq tx/blk notifications
const gsZmqTxns = new Set<string>();
const gsZmqBlocks = new Set<string>();

// connect to gs++ ZMQ notifications
const sock = zmq.socket('sub');
sock.connect('tcp://127.0.0.1:29069');
sock.subscribe('rawtx');
sock.subscribe('rawblock');
console.log("Subscriber connected to gs++");

sock.on('message', (topic: string, message: Buffer) => {
    if (topic.toString() === 'rawtx') {
        gsZmqTxns.add(Crypto.HashTxid(message).toString("hex"));
    } else if (topic.toString() === 'rawblock') {
        gsZmqBlocks.add(Crypto.Hash256(message).toString("hex"));
    }
});

const WAIT_FOR_GS_ZMQ = async (txid: string, msg?: string) => {
    if (msg) {
        console.log(msg);
    }
    console.time("gs++ zmq");
    while (! gsZmqTxns.has(txid)) {
        await sleep(100);
    }
    console.timeEnd("gs++ zmq");
}

describe("test double-spend", () => {
    step("bitcoind1 ready", async () => {
        const info = await bchnRpc1.getBlockchainInfo();
        assert.strictEqual(info.chain, "regtest");
    });
    step("gs++ ready (connected to bitcoind1)", async () => {
        const status = await gsGrpc.getStatus();
        const height = status.getBlockHeight();
        assert.ok(height >= 0);
    });
    step("bitcoind2 ready", async () => {
        const info = await bchnRpc2.getBlockchainInfo();
        assert.strictEqual(info.chain, "regtest");
    });
    step("initially bitcoind1 is connected to bitcoind2 (to sync chain)", async () => {
        let peerInfo1 = await bchnRpc1.getPeerInfo();
        peerInfo1 = peerInfo1.filter(i => i.addr === "bitcoind2");
        while (peerInfo1.length !== 1 || peerInfo1[0].addnode === false) {
            await sleep(100);
            try { await bchnRpc1.addNode("bitcoind2", "add"); } catch (_) {}
            peerInfo1 = await bchnRpc1.getPeerInfo();
            peerInfo1 = peerInfo1.filter(i => i.addr === "bitcoind2");
        }
        assert.strictEqual(peerInfo1.length, 1);
        assert.ok(peerInfo1[0].addnode);

        let peerInfo2 = await bchnRpc2.getPeerInfo();
        peerInfo2 = peerInfo2.filter(i => i.addr === "bitcoind1");
        while (peerInfo2.length !== 1 || peerInfo2[0].addnode === false) {
            await sleep(100);
            try { await bchnRpc2.addNode("bitcoind1", "add"); } catch (_) {}
            peerInfo2 = await bchnRpc2.getPeerInfo();
            peerInfo2 = peerInfo2.filter(i => i.addr === "bitcoind1");
        }
        assert.strictEqual(peerInfo2.length, 1);
        assert.ok(peerInfo2[0].addnode);
    });
    step("setup wallets", async () => {
        wallet1 = await RpcWalletClient.CreateRegtestWallet(bchnRpc1);
        let bal = await wallet1.getAllUnspent(false);
        assert.ok(bal.length > 0);

        wallet2 = await RpcWalletClient.CreateRegtestWallet(bchnRpc2);
        // this is next part is not necessary, but fine to leave it
        bal = await wallet2.getAllUnspent(false);
        assert.ok(bal.length > 0);
    });
    step("make some slp transactions", async () => {
        tokenId1 = await wallet1.slpGenesis();
        await WAIT_FOR_GS_ZMQ(tokenId1);
        const gs = await gsGrpc.trustedValidationFor({ hash: tokenId1, reversedHashOrder: true });
        assert.strictEqual(gs.getValid(), true);

        for (let i = 0; i < 10; i++) {
            const txid = await wallet1.slpMint(tokenId1, { address: wallet1.address, tokenAmount: new BigNumber(100) }, 2);
            await WAIT_FOR_GS_ZMQ(txid);
            await bchnRpc1.generateToAddress(1, wallet1.address.cashAddress);
        }
    });
    step("disconnect the nodes", async () => {
        // first mine a block to syncronize the nodes before disconnecting
        await bchnRpc1.generateToAddress(1, wallet1._untrackedMiningAddress);
        let info1 = await bchnRpc1.getBlockchainInfo();
        let info2 = await bchnRpc2.getBlockchainInfo();
        while (info1.bestblockhash !== info2.bestblockhash) {
            await sleep(100);
            info1 = await bchnRpc1.getBlockchainInfo();
            info2 = await bchnRpc2.getBlockchainInfo();
        }
        assert.strictEqual(info1.bestblockhash, info2.bestblockhash);

        let peerInfo1 = await bchnRpc1.getPeerInfo();
        while (peerInfo1.length !== 0) {
            await sleep(100);
            for (const info of peerInfo1) {
                // @ts-ignore
                try { await bchnRpc1.disconnectNode(info.addr); } catch (_) {}
            }
            peerInfo1 = await bchnRpc1.getPeerInfo();
        }
        assert.strictEqual(peerInfo1.length, 0);

        let peerInfo2 = await bchnRpc2.getPeerInfo();
        while (peerInfo2.length !== 0) {
            await sleep(100);
            for (const info of peerInfo2) {
                // @ts-ignore
                try { await bchnRpc2.disconnectNode(info.addr); } catch (_) {}
            }
            peerInfo2 = await bchnRpc2.getPeerInfo();
        }
        assert.strictEqual(peerInfo2.length, 0);
    });
    step("double spend", async () => {
        // submit send to node 1
        const txn1 = await wallet1.buildSlpMint(tokenId1, { address: wallet1.address, tokenAmount: new BigNumber(1)}, 2);
        const txid1 = await wallet1.submitTransaction(txn1.serialize());
        assert.strictEqual(txid1.length, 64);
        const gsRes1 = await gsGrpc.trustedValidationFor({ hash: txid1, reversedHashOrder: true });
        assert.strictEqual(gsRes1.getValid(), true);

        // optional: mine txn so it is confirmed first
        await bchnRpc1.generateToAddress(3, wallet1._untrackedMiningAddress);

        // change the receiver address, resign, and submit to node 2 to cause a double-spend
        const s1 = txn1.inputs[0].script.toHex();
        txn1.outputs[1].setScript(getScriptPubKey(wallet2.address));
        const txn2 = wallet1.sign(txn1);
        assert.notStrictEqual(s1, txn2.inputs[0].script.toHex());
        const txid2 = await wallet2.submitTransaction(txn2.serialize());
        assert.strictEqual(txid2.length, 64);

        // make sure the txid changed
        assert.notStrictEqual(txid1, txid2);

        // mine couple blocks on node 2, leave in mempool on node 1 -- TODO: try with node1 txn in block to see if that affects anything
        await bchnRpc2.generateToAddress(10, wallet2._untrackedMiningAddress);

        // reconnect nodes so double-spend occurs
        // NOTE: this can take 30-60 seconds, maybe something to do with full node DoS prevention
        let peerInfo1 = await bchnRpc1.getPeerInfo();
        peerInfo1 = peerInfo1.filter(i => i.addr === "bitcoind2");
        let peerInfo2 = await bchnRpc2.getPeerInfo();
        peerInfo2 = peerInfo2.filter(i => i.addr === "bitcoind1");
        while (peerInfo1.length !== 1 || peerInfo1[0].addnode === false || peerInfo2.length !== 1 || peerInfo2[0].addnode === false) {
            await sleep(1000);
            try { await bchnRpc1.addNode("bitcoind2", "add"); } catch (_) {}
            peerInfo1 = await bchnRpc1.getPeerInfo();
            peerInfo1 = peerInfo1.filter(i => i.addr === "bitcoind2");
            try { await bchnRpc2.addNode("bitcoind1", "add"); } catch (_) {}
            peerInfo2 = await bchnRpc2.getPeerInfo();
            peerInfo2 = peerInfo2.filter(i => i.addr === "bitcoind1");
        }
        assert.strictEqual(peerInfo1.length, 1);
        assert.ok(peerInfo1[0].addnode);
        assert.strictEqual(peerInfo2.length, 1);
        assert.ok(peerInfo2[0].addnode);

        // check gs++ trusted validation
        const gsRes2 = await gsGrpc.trustedValidationFor({ hash: txid2, reversedHashOrder: true });
        assert.strictEqual(gsRes2.getValid(), true);
        const gsRes3 = await gsGrpc.trustedValidationFor({ hash: txid1, reversedHashOrder: true });
        assert.strictEqual(gsRes3.getValid(), true);

        // check gs++ graph search dag size
        const gsRes4 = await gsGrpc.graphSearchFor({ hash: txid2, reversedHashOrder: true });
        assert.strictEqual(gsRes4.getTxdataList_asU8().length, 12);

        // make sure txid1 is not recognized by either node
        assert.rejects(async () => { await bchnRpc1.getRawTransaction(txid1); });
        assert.rejects(async () => { await bchnRpc2.getRawTransaction(txid1); });

        // make sure txid2 is recognized by both nodes
        assert.doesNotReject(async () => { await bchnRpc1.getRawTransaction(txid2); });
        assert.doesNotReject(async () => { await bchnRpc2.getRawTransaction(txid2); });
    });
});
