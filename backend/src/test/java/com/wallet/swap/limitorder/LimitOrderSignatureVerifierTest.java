package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import java.math.BigInteger;
import org.junit.jupiter.api.Test;
import org.web3j.crypto.ECKeyPair;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.crypto.StructuredDataEncoder;
import org.web3j.utils.Numeric;

class LimitOrderSignatureVerifierTest {
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final LimitOrderSignatureVerifier verifier = new LimitOrderSignatureVerifier(objectMapper);

  @Test
  void verifiesTheSignerAndFullTypedOrderHash() throws Exception {
    SignedOrder order = signedOrder();

    assertThatCode(() -> verifier.verify(order.wallet(), order.orderHash(), order.signature(), order.typedData()))
        .doesNotThrowAnyException();
  }

  @Test
  void rejectsAHashThatDoesNotRepresentTheSignedTerms() throws Exception {
    SignedOrder order = signedOrder();

    assertThatThrownBy(() -> verifier.verify(
        order.wallet(),
        "0x" + "0".repeat(64),
        order.signature(),
        order.typedData()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("hash");
  }

  @Test
  void rejectsASignatureFromAnotherWallet() throws Exception {
    SignedOrder order = signedOrder();

    assertThatThrownBy(() -> verifier.verify(
        "0x0000000000000000000000000000000000000001",
        order.orderHash(),
        order.signature(),
        order.typedData()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("owner");
  }

  @Test
  void verifiesAnExactCowCancellationSigner() throws Exception {
    JsonNode typedData = objectMapper.readTree("""
        {
          "types": {
            "EIP712Domain": [
              {"name": "name", "type": "string"},
              {"name": "version", "type": "string"},
              {"name": "chainId", "type": "uint256"},
              {"name": "verifyingContract", "type": "address"}
            ],
            "OrderCancellation": [
              {"name": "orderUid", "type": "bytes"}
            ]
          },
          "primaryType": "OrderCancellation",
          "domain": {
            "name": "Gnosis Protocol",
            "version": "v2",
            "chainId": 1,
            "verifyingContract": "0x9008D19f58AAbD9eD0D60971565AA8510560ab41"
          },
          "message": {
            "orderUid": "0x%s"
          }
        }
        """.formatted("a".repeat(112)));
    byte[] digest = new StructuredDataEncoder(objectMapper.writeValueAsString(typedData)).hashStructuredData();
    ECKeyPair keyPair = ECKeyPair.create(BigInteger.ONE);
    String signature = signatureHex(digest, keyPair);
    String wallet = "0x" + Keys.getAddress(keyPair.getPublicKey());

    assertThatCode(() -> verifier.verifyTypedDataSigner(
        wallet,
        "OrderCancellation",
        signature,
        typedData)).doesNotThrowAnyException();
  }

  @Test
  void rejectsCancellationTypedDataWithAnotherPrimaryType() throws Exception {
    SignedOrder order = signedOrder();

    assertThatThrownBy(() -> verifier.verifyTypedDataSigner(
        order.wallet(),
        "OrderCancellation",
        order.signature(),
        order.typedData()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("cancellation");
  }

  private SignedOrder signedOrder() throws Exception {
    JsonNode typedData = objectMapper.readTree("""
        {
          "types": {
            "EIP712Domain": [
              {"name": "name", "type": "string"},
              {"name": "version", "type": "string"},
              {"name": "chainId", "type": "uint256"},
              {"name": "verifyingContract", "type": "address"}
            ],
            "Order": [
              {"name": "sellToken", "type": "address"},
              {"name": "buyToken", "type": "address"},
              {"name": "receiver", "type": "address"},
              {"name": "sellAmount", "type": "uint256"},
              {"name": "buyAmount", "type": "uint256"},
              {"name": "validTo", "type": "uint32"},
              {"name": "appData", "type": "bytes32"},
              {"name": "feeAmount", "type": "uint256"},
              {"name": "kind", "type": "string"},
              {"name": "partiallyFillable", "type": "bool"},
              {"name": "sellTokenBalance", "type": "string"},
              {"name": "buyTokenBalance", "type": "string"}
            ]
          },
          "primaryType": "Order",
          "domain": {
            "name": "Gnosis Protocol",
            "version": "v2",
            "chainId": 1,
            "verifyingContract": "0x9008D19f58AAbD9eD0D60971565AA8510560ab41"
          },
          "message": {
            "sellToken": "0x0000000000000000000000000000000000000002",
            "buyToken": "0x0000000000000000000000000000000000000003",
            "receiver": "0x0000000000000000000000000000000000000004",
            "sellAmount": "1000000000000000000",
            "buyAmount": "2500000000",
            "validTo": 2000000000,
            "appData": "0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d",
            "feeAmount": "0",
            "kind": "sell",
            "partiallyFillable": false,
            "sellTokenBalance": "erc20",
            "buyTokenBalance": "erc20"
          }
        }
        """);
    byte[] digest = new StructuredDataEncoder(objectMapper.writeValueAsString(typedData)).hashStructuredData();
    ECKeyPair keyPair = ECKeyPair.create(BigInteger.ONE);
    String signature = signatureHex(digest, keyPair);
    return new SignedOrder(
        "0x" + Keys.getAddress(keyPair.getPublicKey()),
        Numeric.toHexString(digest),
        signature,
        typedData);
  }

  private String signatureHex(byte[] digest, ECKeyPair keyPair) {
    Sign.SignatureData signatureData = Sign.signMessage(digest, keyPair, false);
    byte[] signature = new byte[65];
    System.arraycopy(signatureData.getR(), 0, signature, 0, 32);
    System.arraycopy(signatureData.getS(), 0, signature, 32, 32);
    System.arraycopy(signatureData.getV(), 0, signature, 64, 1);
    return Numeric.toHexString(signature);
  }

  private record SignedOrder(String wallet, String orderHash, String signature, JsonNode typedData) {}
}
