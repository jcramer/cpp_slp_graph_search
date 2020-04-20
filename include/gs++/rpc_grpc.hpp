#ifndef GS_RPC_GRPC_HPP
#define GS_RPC_GRPC_HPP

#include <vector>
#include <string>
#include <memory>
#include <cassert>
#include <iostream>
#include <httplib/httplib.h>
#include <nlohmann/json.hpp>
#include <gs++/bhash.hpp>
#include <gs++/util.hpp>

#include <grpc++/grpc++.h>
#include <bchrpc.grpc.pb.h>

namespace gs {

class BchGrpcClient 
{

public:
    BchGrpcClient(std::shared_ptr<grpc_impl::Channel> channel);
    std::pair<bool, gs::blockhash> get_block_hash(const std::size_t height);
    std::pair<bool, std::vector<std::uint8_t>> get_raw_block(const gs::blockhash& block_hash);
    std::pair<bool, std::uint32_t> get_best_block_height();
    std::pair<bool, std::vector<gs::txid>> get_raw_mempool();
    std::pair<bool, std::vector<std::uint8_t>> get_raw_transaction(const gs::txid& txid);    
    int subscribe_raw_transactions(std::function<void (std::string txn)> callback);
    int subscribe_raw_blocks(std::function<void (std::string block)> callback);

private:
    std::unique_ptr<pb::bchrpc::Stub> stub_;
};

}

#endif
