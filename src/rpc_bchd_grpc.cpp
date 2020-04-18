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
#include <libbase64.h>


#include <grpc++/grpc++.h>
#include <bchrpc.grpc.pb.h>


namespace gs {

    class BchGrpcClient {

    public:
        BchGrpcClient(std::shared_ptr<grpc::Channel> channel)
        : stub_(pb::bchrpc::NewStub(channel)) 
        {}

        std::pair<bool, gs::blockhash> get_block_hash(
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

            return { true, reply.info().hash };       
        }

        std::pair<bool, std::vector<std::uint8_t>> get_raw_block(
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

            // FIXME: block() probably returns base64
            return { true, base64_decode(reply.block()) };
        }

        std::pair<bool, std::uint32_t> get_best_block_height()
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

        // std::pair<bool, nlohmann::json> get_decode_raw_transaction(
        // const std::string& hex_str
        // ) {
        //     // FIXME:  bchd has no such method, we would need to manually map 
        //     //          fields from RawTransactoinResponse to json object
        // }

        std::pair<bool, std::vector<gs::txid>> get_raw_mempool()
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

            // FIXME: map response to std::vector from grpc list pointer
            return { true, reply.transaction_data() };
        }

        std::pair<bool, std::vector<std::uint8_t>> get_raw_transaction(
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

            // FIXME: transaction is probably in base64 format, convert to vector<uint8>
            return { true, base64_decode(reply.transaction()) };
        }

    private:
        std::unique_ptr<pb::bchrpc::Stub> stub_;
    };
}
