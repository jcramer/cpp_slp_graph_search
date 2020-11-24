import { step } from 'mocha-steps';
import * as assert from "assert";
import { GraphSearchClient } from "grpc-graphsearch-node";
import { PrivateKey, Networks } from "bitcore-lib-cash";
import * as bchaddrjs from "bchaddrjs-slp";
import { ValidatorType1, Slp, Transaction, SlpTransactionType, Crypto } from "slp-validate";

import { retrieveSlpUtxos, createRawTx } from "slp-light";
import { BchUtxoRetrieverFacade } from "slp-light/src/facade/UtxoRetrieverFacade";
import { Address, SlpToken, Utxo } from 'slp-light/build/main/utxo/Utxo';
import { BigNumber } from "bignumber.js"

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// setup the rpc connections to bitcoind nodes and gs++
const rpcClient = require('bitcoin-rpc-promise');
const bchnRpc1 = new rpcClient('http://bitcoin:password@0.0.0.0:18443');
const bchnRpc2 = new rpcClient('http://bitcoin:password@0.0.0.0:18444');
const gsGrpc = new GraphSearchClient({ url: "localhost:50051", notls: true });

// setup a new local SLP validator instance
const slpValidator = new ValidatorType1({ getRawTransaction: async (txid) => await bchnRpc1.getRawTransaction(txid) });

// a simple method to get slp value of 
const getSlpToken = async (txid: string, vout: number): Promise<SlpToken|undefined> => {
    const isValidSlp = await slpValidator.isValidSlpTxid({txid});
    if (!isValidSlp) {
        return null;
    }
    
    const txnBuf = slpValidator.cachedRawTransactions.get(txid);
    const txn = Transaction.parseFromBuffer(txnBuf);

    let slpMsg = Slp.parseSlpOutputScript(txn.outputs[0].scriptPubKey);
    if (vout < txn.outputs.length) {
        switch (slpMsg.transactionType) {
            case SlpTransactionType.GENESIS:
                if (vout === 1) {
                    return { slpTokenId: txid, amount: new BigNumber(slpMsg.genesisOrMintQuantity.toString()), transactionType: "GENESIS", hasBaton: false };
                } else if (slpMsg.containsBaton && vout === slpMsg.batonVout) {
                    return { slpTokenId: txid, amount: new BigNumber(0), transactionType: "GENESIS", hasBaton: true };
                }
            case SlpTransactionType.MINT:
                if (vout === 1) {
                    return { slpTokenId: txid, amount: new BigNumber(slpMsg.genesisOrMintQuantity.toString()), transactionType: "MINT", hasBaton: false };
                } else if (slpMsg.containsBaton && vout === slpMsg.batonVout) {
                    return { slpTokenId: txid, amount: new BigNumber(0), transactionType: "MINT", hasBaton: true };
                }
            case SlpTransactionType.SEND:
                if (vout < slpMsg.sendOutputs!.length) {
                    return { slpTokenId: txid, amount: new BigNumber(slpMsg.sendOutputs[vout]), transactionType: "SEND", hasBaton: false };
                }
            default:
                throw Error("unhandled slp token type");
        }
    }
    throw Error("no slp assignment");
}

// setup slp-light utxo retreiver
const retriever: BchUtxoRetrieverFacade = {
    async getBchUtxosFromAddress(address: Address): Promise<Utxo[]> {

        let unspent: RpcListUnspentRes[] = await bchnRpc1.listUnspent(0, null, [address.cashAddress]);
        let txos: Utxo[] = [];
        for (const txo of unspent) {
            txos.push({
                address,
                slpToken: await getSlpToken(txo.txid, txo.vout),
                txId: txo.txid,
                index: txo.vout,
                amount: txo.amount,
            });
        }

        return txos;
    }
}

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

});

// const privKey1 = new PrivateKey("cPgxbS8PaxXoU9qCn1AKqQzYwbRCpizbsG98xU2vZQzyZCJt4NjB", Networks.testnet);
// const wallet1 = {
//     _privKey: privKey1,
//     address: bchaddrjs.toRegtestAddress(privKey1.toAddress().toString()),
//     wif: privKey1.toWIF(),
//     pubKey: privKey1.toPublicKey()
// };

let address: Address;
let wif: string;

describe("basic tests", async () => {
    step("generate block to address", async () => {

        // grab the unspent txos and grab first address with a balance
        let unspent: RpcListUnspentRes[] = await bchnRpc1.listUnspent();
        address = { cashAddress: unspent[0].address, slpAddress: bchaddrjs.toSlpAddress(unspent[0].address) };
        let txos = await retriever.getBchUtxosFromAddress(address);

        // let unspent = await bchnRpc1.listUnspent(0);
        // while (unspent.length === 0) {
        //     await bchnRpc1.generate(1);
        //     unspent = await bchnRpc1.listUnspent(0);
        // }

        // address = unspent[0].address;
        // wif = await bchnRpc1.dumpPrivKey(address);

        //console.log(res);

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

interface RpcListUnspentRes {
    address: string;
    amount: number;
    confirmations: number;
    safe:boolean;
    scriptPubKey: string;
    solvable: boolean;
    spendable:boolean;
    txid: string;
    vout: number;
}
