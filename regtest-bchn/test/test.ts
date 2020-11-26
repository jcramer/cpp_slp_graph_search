import { step } from 'mocha-steps';
import * as assert from "assert";
import { GraphSearchClient } from "grpc-graphsearch-node";
import { BigNumber } from "bignumber.js";
import { BitcoinRpcClient, RpcWalletClient, sleep, validityCache } from './helpers/rpcwallet';

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
let tokenId: string;

// TODO?: setup async randomized block generation for the two full nodes using setTimeout.

describe("network health check", () => {
    step("bitcoind1 ready", async () => {
        const info = await bchnRpc1.getBlockchainInfo();
        assert.strictEqual(info.chain, "regtest");
    });
    step("gs++ ready (connected to bitcoind1)", async () => {
        const status = await gsGrpc.getStatus();
        const height = status.getBlockHeight();
        assert.ok(height >= 0);
    });
    step("bitcoind1 ready", async () => {
        const info = await bchnRpc2.getBlockchainInfo();
        assert.strictEqual(info.chain, "regtest");
    });
    step("bitcoind1 and bitcoind2 are connected", async () => {
        let peerInfo1 = await bchnRpc1.getPeerInfo();
        if (peerInfo1.length < 1) {
            await bchnRpc1.addNode("bitcoind2", "onetry");
            while (peerInfo1.length < 1) {
                await sleep(100);
                peerInfo1 = await bchnRpc1.getPeerInfo();
            }
        }
        assert.strictEqual(peerInfo1.length, 1);

        let peerInfo2 = await bchnRpc2.getPeerInfo();
        assert.strictEqual(peerInfo2.length, 1);
    });
});

describe("basic wallet setup", async () => {
    step("setup wallet 1 (at bitcoind1)", async () => {
        wallet1 = await RpcWalletClient.CreateRegtestWallet(bchnRpc1);
        let bal = await wallet1.getAllUnspent(false);
        assert.ok(bal.length > 0);
    });
    // step("setup wallet 2 (at bitcoind2)", async () => {
    //     // setup a new wallet instances
    //     wallet2 = await RpcWalletClient.CreateRegtestWallet(bchnRpc2);
    //     let bal = await wallet1.getAllUnspent();
    //     assert.ok(bal.length > 0);
    //     assert.ok(1);
    // });
    step("submit an slp genesis transaction", async () => {
        tokenId = await wallet1.slpGenesis();
        await sleep(100);
        let gs = await gsGrpc.trustedValidationFor({ hash: tokenId, reversedHashOrder: true });
        assert.strictEqual(gs.getValid(), true);
    });
    step("submit an slp mint transaction", async () => {
        let txid = await wallet1.slpMint(tokenId, { address: wallet1.address, amount: new BigNumber(100) }, 2);
        await sleep(100);
        let gs = await gsGrpc.trustedValidationFor({ hash: txid, reversedHashOrder: true });
        assert.strictEqual(gs.getValid(), true);
    });
    step("submit an slp send transaction", async () => {
        let txid = await wallet1.slpSend(tokenId, [{address: wallet1.address, tokenAmount: new BigNumber(1)}]);
        await sleep(100);
        let gs = await gsGrpc.trustedValidationFor({ hash: txid, reversedHashOrder: true });
        assert.strictEqual(gs.getValid(), true);
    });
    step("long minting string returns proper graph search results, 1 mint per block", async () => {
        let dagCount: number|null = null;
        for (let i = 0; i < 10000; i++) {
            
            console.time("new address");
            // get a new address to send the generated BCH and minted SLP (keeps unspent list small for main address)
            console.timeEnd("new address");

            console.time("mint");
            // mint slp token & check gs++ validity
            let txid = await wallet1.slpMint(tokenId, {address: {cashAddress: wallet1._miningAddress, slpAddress: wallet1._miningAddress}, amount: new BigNumber(100)} , 2);
            console.timeEnd("mint");
            await sleep(10);

            console.time("gs++");
            let gs1 = await gsGrpc.trustedValidationFor({ hash: txid, reversedHashOrder: true });
            assert.strictEqual(gs1.getValid(), true);
            validityCache.add(txid);

            // check the graph search results length is increased by 1
            let gs2 = await gsGrpc.graphSearchFor({ hash: txid, reversedHashOrder: true });
            if (! dagCount) {
                dagCount = gs2.getTxdataList_asU8().length;
            } else {
                assert.strictEqual(++dagCount, gs2.getTxdataList_asU8().length);
            }
            console.log(`dag size ${dagCount}`);
            console.timeEnd("gs++");

            console.time("generate");
            // mine the mint txn into a block
            await bchnRpc1.generateToAddress(1, wallet1._miningAddress);
            console.timeEnd("generate");
        }
    });
});
