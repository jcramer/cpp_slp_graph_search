#pragma once

#include <gs++/rpc_json.hpp>
#include <gs++/rpc_grpc.hpp>

namespace gs
{

class RpcClient
{
public:
    RpcClient(gs::rpc & rpc);
    RpcClient(gs::BchGrpcClient & rpc);
    std::pair<bool, gs::blockhash> get_block_hash(const std::size_t height);
    std::pair<bool, std::vector<std::uint8_t>> get_raw_block(const gs::blockhash& block_hash);
    std::pair<bool, std::uint32_t> get_best_block_height();
    std::pair<bool, std::vector<gs::txid>> get_raw_mempool();
    std::pair<bool, std::vector<std::uint8_t>> get_raw_transaction(const gs::txid& txid);    
    int subscribe_raw_transactions(std::function<void (std::string txn)> callback);
    int subscribe_raw_blocks(std::function<void (std::string block)> callback);

private:
    gs::rpc *rpc_json;
    gs::BchGrpcClient *rpc_grpc;
};

}
