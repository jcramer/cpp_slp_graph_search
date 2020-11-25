import { BigNumber } from "bignumber.js";
import { PrivateKey, Transaction } from "bitcore-lib-cash";
import * as bchaddrjs from "bchaddrjs-slp";
import { Slp, SlpTransactionType, ValidatorType1, Transaction as Txn, SlpTransactionDetails } from "slp-validate";
import { Address, SlpToken, Utxo } from "slp-light/src/utxo/Utxo";
import * as mdm from "slp-mdm";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const validityCache = new Set<string>();
const txnCache = new Map<string, Buffer>();

export class RpcWalletClient implements IWallet {
    _rpcClient: BitcoinRpcClient;
    _slpValidator: ValidatorType1;

    _unspentCache: RpcListUnspentRes[] = [];

    
    address!: Address;
    wif!: string;

    public static async CreateRegtestWallet(rpcClient: BitcoinRpcClient) {
        let w = new RpcWalletClient(rpcClient);
        await w.generateForBalance();
        return w
    }

    private constructor(rpcClient: BitcoinRpcClient) {
        this._rpcClient = rpcClient;
        this._slpValidator = new ValidatorType1({ getRawTransaction: async (txid) => {
            return await this._getRawTransaction(txid);
        }});
    }

    private async generateForBalance(): Promise<void> {
        // grab the unspent txos and grab first address with a balance
        let unspent: RpcListUnspentRes[] = await this._rpcClient.listUnspent();
        this._unspentCache = unspent;

        // mine some coins if necessary
        if (unspent.length < 1) {
            let _miningAddr = await this._rpcClient.getNewAddress();
            while (unspent.length === 0) {
                _miningAddr = await this._rpcClient.getNewAddress();
                await this._rpcClient.generateToAddress(1, _miningAddr);
                unspent = await this._rpcClient.listUnspent(0);
            }
        } 

        this.address = { cashAddress: unspent[0].address, slpAddress: bchaddrjs.toSlpAddress(unspent[0].address) };
        this.wif = await this._rpcClient.dumpPrivKey(this.address.cashAddress);
    }


    async _getRawTransaction(txid: string): Promise<string> {
        return this._rpcClient.getRawTransaction(txid) as Promise<string>;
    }

    async _listUnspent(address: string): Promise<RpcListUnspentRes[]> {
        return this._rpcClient.listUnspent(0, undefined, [address]);
    }

    async _getUnspentTxos(address: Address): Promise<Utxo[]> {
        let unspent: RpcListUnspentRes[] = await this._listUnspent(address.cashAddress);
        let txos: Utxo[] = [];
        for (const txo of unspent) {
            txos.push({
                address,
                slpToken: await this._getSlpToken(txo.txid, txo.vout),
                txId: txo.txid,
                index: txo.vout,
                amount: txo.amount,
            });
        }
        return txos;
    }

    async getUtxosFromAddress(address: Address, tokenId?: string) {
        let txos: Utxo[] = await this._getUnspentTxos(address);
        return { 
            bch: txos.filter(txo => !txo.slpToken).sort((a, b) => b.amount - a.amount),
            slp: txos.filter(txo => txo.slpToken && txo.slpToken!.slpTokenId === tokenId && !txo.slpToken.hasBaton),
            baton: txos.filter(txo => txo.slpToken && txo.slpToken!.slpTokenId === tokenId && txo.slpToken.hasBaton)
        }
    }

    async _getSlpToken(txid: string, vout: number): Promise<SlpToken|undefined> {
        const isValidSlp = validityCache.has(txid) ? true : await this._slpValidator.isValidSlpTxid({ txid });
        if (! isValidSlp) {
            return undefined;
        }
        const txnBuf = txnCache.has(txid) ? txnCache.get(txid)! : this._slpValidator.cachedRawTransactions.get(txid)!;
        const txn = Txn.parseFromBuffer(txnBuf);
        let slpMsg: SlpTransactionDetails;
        try {
            slpMsg = Slp.parseSlpOutputScript(txn.outputs[0].scriptPubKey);
        } catch(_) {
            return undefined;
        }
        if (vout < txn.outputs.length) {
            switch (slpMsg.transactionType) {
                case SlpTransactionType.GENESIS:
                    if (vout === 1 && slpMsg.genesisOrMintQuantity!.gt(0)) {
                        return { slpTokenId: txid, amount: new BigNumber(slpMsg.genesisOrMintQuantity!.toString()), transactionType: "GENESIS", hasBaton: false };
                    } else if (slpMsg.containsBaton && vout === slpMsg.batonVout) {
                        return { slpTokenId: txid, amount: new BigNumber(0), transactionType: "GENESIS", hasBaton: true };
                    }
                    break;
                case SlpTransactionType.MINT:
                    if (vout === 1 && slpMsg.genesisOrMintQuantity!.gt(0)) {
                        return { slpTokenId: slpMsg.tokenIdHex, amount: new BigNumber(slpMsg.genesisOrMintQuantity!.toString()), transactionType: "MINT", hasBaton: false };
                    } else if (slpMsg.containsBaton && vout === slpMsg.batonVout) {
                        return { slpTokenId: slpMsg.tokenIdHex, amount: new BigNumber(0), transactionType: "MINT", hasBaton: true };
                    }
                    break;
                case SlpTransactionType.SEND:
                    if (vout < slpMsg.sendOutputs!.length && slpMsg.sendOutputs![vout].gt(0)) {
                        return { slpTokenId: slpMsg.tokenIdHex, amount: new BigNumber(slpMsg.sendOutputs![vout]), transactionType: "SEND", hasBaton: false };
                    }
                    break;
                default:
                    throw Error("unhandled slp token type");
            }
        }
        return undefined;
    }

    async getAllUnspent(cached=true): Promise<RpcListUnspentRes[]> {
        if (cached) {
            return this._unspentCache;
        } else {
            return this._rpcClient.listUnspent(0);
        }
    }

    async bchSend(to: { address: string, satoshis: number }[]) {
        throw Error('not implemented')
    }

    async slpGenesis(type=0x01): Promise<string> {

        let txos = await this.getUtxosFromAddress(this.address);

        let txn = new Transaction();

        txn.from([
            ...txos.bch.map<Transaction.UnspentOutput>((txo, i, _) => {
                //@ts-ignore
                return {
                    txId: txo.txId,
                    outputIndex: txo.index,
                    satoshis: txo.amount*10**8,
                    script: getScriptPubKey(txo.address),
                } as Transaction.UnspentOutput
            })
        ]);
    
        // add slp genesis op_return
        let slpMsg = mdm.TokenType1.genesis("TEST", "This is a test", "", "", 0, 2, new mdm.BN(1));
        txn.addOutput(new Transaction.Output({satoshis: 0, script: slpMsg }));

        // add dust outputs for token receiver and minting baton
        txn.to(this.address.cashAddress, 546);
        txn.to(this.address.cashAddress, 546);

        // change to sender
        txn.change(this.address.cashAddress);

        // sign the transaction
        txn.sign(new PrivateKey(this.wif));
        console.log(txn.id);
        let txnHex = txn.serialize();
        txnCache.set(txn.id, Buffer.from(txn.serialize(), "hex"));

        // broadcast
        return this._rpcClient.sendRawTransaction(txnHex, false);
    }

    async slpMint(tokenIdHex: string, to: { address: Address, amount: BigNumber }, batonVout: number, type=0x01): Promise<string> {
        let txos = await this.getUtxosFromAddress(this.address, tokenIdHex);
        let baton = txos.baton.find(i => i.slpToken && i.slpToken.hasBaton);

        if (!baton) {
            throw Error("no baton found");
        }

        let txn = new Transaction();

        txn.from([
            {
                txId: baton.txId,
                outputIndex: baton.index,
                satoshis: baton.amount*10**8,
                //@ts-ignore
                script: getScriptPubKey(baton.address),
            },
            ...txos.bch.map<Transaction.UnspentOutput>((txo, i, _) => {
                //@ts-ignore
                return {
                    txId: txo.txId,
                    outputIndex: txo.index,
                    satoshis: txo.amount*10**8,
                    script: getScriptPubKey(txo.address),
                } as Transaction.UnspentOutput
            })
        ]);
    
        // add slp mint op_return
        let slpMsg = mdm.TokenType1.mint(tokenIdHex, batonVout, to.amount);
        txn.addOutput(new Transaction.Output({satoshis: 0, script: slpMsg }));

        // add dust outputs for token receiver and minting baton
        txn.to(to.address.cashAddress, 546);
        txn.to(this.address.cashAddress, 546);

        // change to sender
        txn.change(this.address.cashAddress);

        // sign the transaction
        txn.sign(new PrivateKey(this.wif));
        console.log(txn.id);
        let txnHex = txn.serialize();
        txnCache.set(txn.id, Buffer.from(txn.serialize(), "hex"));

        // broadcast
        return this._rpcClient.sendRawTransaction(txnHex, false);
    }

    async slpSend(tokenIdHex: string, to: { address: Address, tokenAmount: BigNumber }[]): Promise<string> {
        let txos = await this.getUtxosFromAddress(this.address, tokenIdHex);

        let txn = new Transaction();

        txn.from([
            ...txos.slp.map<Transaction.UnspentOutput>((txo, i, _) => {
                //@ts-ignore
                return {
                    txId: txo.txId,
                    outputIndex: txo.index,
                    satoshis: txo.amount*10**8,
                    script: getScriptPubKey(txo.address),
                } as Transaction.UnspentOutput 
            }),
            //@ts-ignore
            ...txos.bch.map<Transaction.UnspentOutput>((txo, i, _) => {
                //@ts-ignore
                return {
                    txId: txo.txId,
                    outputIndex: txo.index,
                    satoshis: txo.amount*10**8,
                    script: getScriptPubKey(txo.address),
                } as Transaction.UnspentOutput
            })
        ]);

        // add slp mint op_return
        let slpMsg = mdm.TokenType1.send(tokenIdHex, to.map((v, i, _) => v.tokenAmount));
        txn.addOutput(new Transaction.Output({satoshis: 0, script: slpMsg }));

        // add slp change back to our wallet
        const slpTotal = txos.slp.reduce((p, c, _) => p.plus(c.slpToken!.amount), new BigNumber(0));
        const slpTo = to.reduce((p, c, _) => p.plus(c.tokenAmount), new BigNumber(0));
        to.push({ address: this.address, tokenAmount: slpTotal.minus(slpTo) });

        // add dust outputs for token receiver and minting baton
        to.forEach((v, i) => {
            txn.to(v.address.cashAddress, 546);
        });

        // change to sender
        txn.change(this.address.cashAddress);

        // sign the transaction
        txn.sign(new PrivateKey(this.wif));
        console.log(txn.id);
        let txnHex = txn.serialize();
        txnCache.set(txn.id, Buffer.from(txn.serialize(), "hex"));

        // broadcast
        return this._rpcClient.sendRawTransaction(txnHex, false);
    }
}

const getScriptPubKey = (address: Address): Buffer => {
    let decoded = bchaddrjs.decodeAddress(address.cashAddress);
    if (bchaddrjs.Type.P2PKH) {
        decoded.hash.unshift(...[118,169,20]); // TODO: get these opcode from some typed npm package
        decoded.hash.push(...[136,172]);       // TODO: get these opcode from some typed npm package
        return Buffer.from(decoded.hash);
    } else if (bchaddrjs.Type.P2SH) {
        decoded.hash.unshift(...[169,20]);     // TODO: get these opcode from some typed npm package
        decoded.hash.push(135);                // TODO: get these opcode from some typed npm package
        return Buffer.from(decoded.hash);
    }
    throw Error("unknown script type");
};

export interface IWallet {
    _rpcClient: BitcoinRpcClient;
    _slpValidator: ValidatorType1;
    _listUnspent: (address: string) => Promise<RpcListUnspentRes[]>;
    _getSlpToken: (txid: string, vout: number) => Promise<SlpToken|undefined>;
    _getUnspentTxos: (addres: Address) => Promise<Utxo[]>
}

export interface BitcoinRpcClient {
    getBlockchainInfo: () => Promise<RpcBlockchainInfoRes>;
    addNode: (node: string, command: string) => Promise<void>;  // "command" can be 'add', 'remove', or 'onetry'
    getPeerInfo: () => Promise<RpcPeerInfoRes[]>;
    getNewAddress: (label?: string) => Promise<string>;
    dumpPrivKey: (address: string) => Promise<string>;
    listUnspent: (minconf?: number, maxconf?: number, addresses?: string[], include_safe?: boolean, query_options?: ListUnspentQueryOptions) => Promise<RpcListUnspentRes[]>;
    getRawTransaction: (txid: string, verbose?: boolean, blockhash?: string) => Promise<string|object>;
    sendRawTransaction: (txnHex: string, allowHighFees?: boolean ) => Promise<string>;
    generateToAddress: (nblocks: number, address: string, maxtries?: number) => Promise<string[]>;
}

interface RpcBlockchainInfoRes {
    chain: string;                  // "chain": "xxxx",              (string) current network name as defined in BIP70 (main, test, regtest)
    blocks: number;                 // "blocks": xxxxxx,             (numeric) the current number of blocks processed in the server
    headers: number;                // "headers": xxxxxx,            (numeric) the current number of headers we have validated
    bestblockhash: string;          // "bestblockhash": "...",       (string) the hash of the currently best block
    difficulty: number;             // "difficulty": xxxxxx,         (numeric) the current difficulty
    mediantime: number;             // "mediantime": xxxxxx,         (numeric) median time for the current best block
    verificationprogress: number;   // "verificationprogress": xxxx, (numeric) estimate of verification progress [0..1]
    initialblockdownload: boolean;  // "initialblockdownload": xxxx, (bool) (debug information) estimate of whether this node is in Initial Block Download mode.
    chainwork: string;              // "chainwork": "xxxx"           (string) total amount of work in active chain, in hexadecimal
    size_on_disk: number;           // "size_on_disk": xxxxxx,       (numeric) the estimated size of the block and undo files on disk
    pruned: boolean;                // "pruned": xx,                 (boolean) if the blocks are subject to pruning
    pruneheight: number;            // "pruneheight": xxxxxx,        (numeric) lowest-height complete block stored (only present if pruning is enabled)
    automatic_pruning: boolean;     // "automatic_pruning": xx,      (boolean) whether automatic pruning is enabled (only present if pruning is enabled)
    prune_target_size: number;      // "prune_target_size": xxxxxx,  (numeric) the target size used by pruning (only present if automatic pruning is enabled)
    warnings: string;               // "warnings" : "...",           (string) any network and blockchain warnings.
}

interface RpcPeerInfoRes {
    // TODO: type this inteface
    //     "id": n,                   (numeric) Peer index
    //     "addr":"host:port",      (string) The IP address and port of the peer
    //     "addrbind":"ip:port",    (string) Bind address of the connection to the peer
    //     "addrlocal":"ip:port",   (string) Local address as reported by the peer
    //     "services":"xxxxxxxxxxxxxxxx",   (string) The services offered
    //     "relaytxes":true|false,    (boolean) Whether peer has asked us to relay transactions to it
    //     "lastsend": ttt,           (numeric) The time in seconds since epoch (Jan 1 1970 GMT) of the last send
    //     "lastrecv": ttt,           (numeric) The time in seconds since epoch (Jan 1 1970 GMT) of the last receive
    //     "bytessent": n,            (numeric) The total bytes sent
    //     "bytesrecv": n,            (numeric) The total bytes received
    //     "conntime": ttt,           (numeric) The connection time in seconds since epoch (Jan 1 1970 GMT)
    //     "timeoffset": ttt,         (numeric) The time offset in seconds
    //     "pingtime": n,             (numeric) ping time (if available)
    //     "minping": n,              (numeric) minimum observed ping time (if any at all)
    //     "pingwait": n,             (numeric) ping wait (if non-zero)
    //     "version": v,              (numeric) The peer version, such as 70001
    //     "subver": "/Satoshi:0.8.5/",  (string) The string version
    //     "inbound": true|false,     (boolean) Inbound (true) or Outbound (false)
    //     "addnode": true|false,     (boolean) Whether connection was due to addnode/-connect or if it was an automatic/inbound connection
    //     "startingheight": n,       (numeric) The starting height (block) of the peer
    //     "banscore": n,             (numeric) The ban score
    //     "synced_headers": n,       (numeric) The last header we have in common with this peer
    //     "synced_blocks": n,        (numeric) The last block we have in common with this peer
    //     "inflight": [
    //        n,                        (numeric) The heights of blocks we're currently asking from this peer
    //        ...
    //     ],
    //     "whitelisted": true|false, (boolean) Whether the peer is whitelisted
    //     "minfeefilter": n,         (numeric) The minimum fee rate for transactions this peer accepts
    //     "bytessent_per_msg": {
    //        "addr": n,              (numeric) The total bytes sent aggregated by message type
    //        ...
    //     },
    //     "bytesrecv_per_msg": {
    //        "addr": n,              (numeric) The total bytes received aggregated by message type
    //        ...
    //     }
}

interface ListUnspentQueryOptions {
    minimumAmount?: number|string;   // "minimumAmount"    (numeric or string, default=0) Minimum value of each UTXO in BCH
    maximumAmount?: number|string;   // "maximumAmount"    (numeric or string, default=unlimited) Maximum value of each UTXO in BCH
    maximumCount?: number|string;    // "maximumCount"     (numeric or string, default=unlimited) Maximum number of UTXOs
    minimumSumAmount: number|string; // "minimumSumAmount" (numeric or string, default=unlimited) Minimum sum value of all UTXOs in BCH
}

interface RpcListUnspentRes {
    txid: string;           // "txid" : "txid",          (string) the transaction id
    vout: number;           // "vout" : n,               (numeric) the vout value
    address: string;        // "address" : "address",    (string) the bitcoin address
    label: string;          // "label" : "label",        (string) The associated label, or "" for the default label
    scriptPubKey: string;   // "scriptPubKey" : "key",   (string) the script key
    amount: number;         // "amount" : x.xxx,         (numeric) the transaction output amount in BCH
    confirmations: number;  // "confirmations" : n,      (numeric) The number of confirmations
    redeemScript: number;   // "redeemScript" : n        (string) The redeemScript if scriptPubKey is P2SH
    spendable:boolean;      // "spendable" : xxx,        (bool) Whether we have the private keys to spend this output
    solvable: boolean;      // "solvable" : xxx,         (bool) Whether we know how to spend this output, ignoring the lack of keys
    safe:boolean;           // "safe" : xxx              (bool) Whether this output is considered safe to spend. Unconfirmed transactions from outside keys are considered unsafe and are not eligible for spending by fundrawtransaction and sendtoaddress.
}
