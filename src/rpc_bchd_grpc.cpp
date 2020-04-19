#include <vector>
#include <string>
#include <memory>
#include <cassert>
#include <iostream>

#include <httplib/httplib.h>
#include <nlohmann/json.hpp>
#include <gs++/util.hpp>
#include <gs++/bhash.hpp>
#include <gs++/rpc.hpp>
#include <gs++/rpc_bchd_grpc.hpp>
#include <libbase64.h>

#include <grpc++/grpc++.h>
#include <bchrpc.grpc.pb.h>


namespace gs {


BchGrpcClient::BchGrpcClient(std::shared_ptr<grpc::Channel> channel)
: stub_(pb::bchrpc::NewStub(channel)) 
{}

std::pair<bool, gs::blockhash> BchGrpcClient::get_block_hash(
    const std::size_t height
) {

    pb::GetBlockInfoRequest request;
    request.set_height(height);

    pb::GetBlockInfoResponse reply;

    grpc::ClientContext context;
    grpc::Status status = stub_->GetBlockInfo(&context, request, &reply);

    if (! status.ok()) {
        std::cout << status.error_code() << ": " << status.error_message() << std::endl;
        return { false, {} };
    }

    if (! reply.has_info()) {
        std::cout << "grpc client error: block_hash returned no info for ${height}" << std::endl;
        return { false, {} };
    }
    
    std::string s_b64 = reply.info().hash();
    std::string decoded(s_b64.size(),'\0');
    std::size_t len = 0;
    base64_decode(
        s_b64.data(),
        s_b64.size(),
        const_cast<char*>(decoded.data()),
        &len,
        0
    );
    decoded.resize(len);

    gs::blockhash hash(decoded);

    return { true, hash };       
}

std::pair<bool, std::vector<std::uint8_t>> BchGrpcClient::get_raw_block(
    const gs::blockhash& block_hash
) {
    pb::GetRawBlockRequest request;
    request.set_hash(block_hash.decompress(false));

    pb::GetRawBlockResponse reply;

    grpc::ClientContext context;
    grpc::Status status = stub_->GetRawBlock(&context, request, &reply);

    if (! status.ok()) {
        std::cout << status.error_code() << ": " << status.error_message() << std::endl;
        return { false, {} };
    }

    std::string s_b64 = reply.block();
    std::string decoded(s_b64.size(),'\0');
    std::size_t len = 0;
    base64_decode(
        s_b64.data(),
        s_b64.size(),
        const_cast<char*>(decoded.data()),
        &len,
        0
    );
    decoded.resize(len);
    std::vector<uint8_t> block(decoded.begin(), decoded.end());

    return { true, block };
}

std::pair<bool, std::uint32_t> BchGrpcClient::get_best_block_height()
{
    pb::GetBlockchainInfoRequest request;
    pb::GetBlockchainInfoResponse reply;

    grpc::ClientContext context;
    grpc::Status status = stub_->GetBlockchainInfo(&context, request, &reply);

    if (! status.ok()) {
        std::cout << status.error_code() << ": " << status.error_message() << std::endl;
        return { false, {} };
    }

    return { true, reply.best_height() };
}

// FIXME:  bchd has no such method, we would need to manually map 
//          fields from RawTransactoinResponse to json object
// std::pair<bool, nlohmann::json> get_decode_raw_transaction(
// const std::string& hex_str
// ) {
// ... 
// }

std::pair<bool, std::vector<gs::txid>> BchGrpcClient::get_raw_mempool()
{
    pb::GetMempoolRequest request;
    request.set_full_transactions(false);

    pb::GetMempoolResponse reply;

    grpc::ClientContext context;
    grpc::Status status = stub_->GetMempool(&context, request, &reply);

    if (! status.ok()) {
        std::cout << status.error_code() << ": " << status.error_message() << std::endl;
        return { false, {} };
    }

    auto txns = reply.transaction_data();
    std::size_t len = 0;
    std::vector<gs::txid> txids;
    for (auto txn : txns) {
        auto s_b64 = txn.transaction_hash();
        std::string decoded(s_b64.size(),'\0');
        std::size_t len = 0;
        base64_decode(
            s_b64.data(),
            s_b64.size(),
            const_cast<char*>(decoded.data()),
            &len,
            0
        );
        decoded.resize(len);
        txids[len] = decoded;
        len++;
    }

    return { true, txids };
}

std::pair<bool, std::vector<std::uint8_t>> BchGrpcClient::get_raw_transaction(
    const gs::txid& txid
) {
    pb::GetRawTransactionRequest request;
    request.set_hash(txid.decompress(false));

    pb::GetRawTransactionResponse reply;

    grpc::ClientContext context;
    grpc::Status status = stub_->GetRawTransaction(&context, request, &reply);

    if (! status.ok()) {
        std::cout << status.error_code() << ": " << status.error_message() << std::endl;
        return { false, {} };
    }

    std::string s_b64 = reply.transaction();
    std::string decoded(s_b64.size(),'\0');
    std::size_t len = 0;
    base64_decode(
        s_b64.data(),
        s_b64.size(),
        const_cast<char*>(decoded.data()),
        &len,
        0
    );
    decoded.resize(len);
    std::vector<uint8_t> txn(decoded.begin(), decoded.end());

    return { true, txn };
}


}
