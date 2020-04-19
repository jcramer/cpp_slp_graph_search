#ifndef GS_RPC_BCHD_GRPC_HPP
#define GS_RPC_BCHD_GRPC_HPP

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
    //std::pair<bool, nlohmann::json> get_decode_raw_transaction(const std::string& hex_str);

    int subscribe_raw_transactions(); // how to specifiy lambda parameter?
    int subscribe_raw_blocks();       // how to specifiy lambda parameter?

private:
    std::unique_ptr<pb::bchrpc::Stub> stub_;
};

}

#endif