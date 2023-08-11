import { MockPermit2 } from "../../typechain-types";
import { deployContract, provider } from "./shared/zkSyncUtils";
import fs from "fs";
import { Wallet } from "zksync-web3";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { expect } from "./shared/expect";

const RICH_WALLET_PRIVATE_KEYS = JSON.parse(
  fs.readFileSync("test/zksync-tests/shared/rich-wallets.json", "utf8"),
);

function getRandomBigInt(): BigNumber {
  return ethers.BigNumber.from(ethers.utils.randomBytes(31)).sub(1);
}

describe("NonceBitmap", function () {
  let permit2: MockPermit2;
  let spender: Wallet;

  beforeEach(async function () {
    permit2 = <MockPermit2>await deployContract("MockPermit2");
    spender = new Wallet(RICH_WALLET_PRIVATE_KEYS[1].privateKey, provider);
  });

  describe("Test Low Nonces", function () {
    it("should tested", async function () {
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(5))
      ).wait();
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(0))
      ).wait();
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(1))
      ).wait();

      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(spender.address, ethers.BigNumber.from(1))
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(spender.address, ethers.BigNumber.from(5))
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(spender.address, ethers.BigNumber.from(0))
        ).wait(),
      ).to.be.reverted;

      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(4))
      ).wait();
    });
  });

  describe("Test Nonce Word Boundary", function () {
    it("should fail 2", async function () {
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(255))
      ).wait();
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(256))
      ).wait();

      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(spender.address, ethers.BigNumber.from(255))
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(spender.address, ethers.BigNumber.from(256))
        ).wait(),
      ).to.be.reverted;
    });
  });

  describe("Test High Nonces", function () {
    it("should fail 3", async function () {
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(spender.address, ethers.BigNumber.from(2).pow(240))
      ).wait();
      await (
        await permit2
          .connect(spender)
          .useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(2).pow(240).add(ethers.constants.One),
          )
      ).wait();

      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(
              spender.address,
              ethers.BigNumber.from(2).pow(240),
            )
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2
            .connect(spender)
            .useUnorderedNonce(
              spender.address,
              ethers.BigNumber.from(2).pow(240).add(ethers.constants.One),
            )
        ).wait(),
      ).to.be.reverted;
    });
  });

  describe("Test Invalidate Full Word", function () {
    it("should fail 4", async function () {
      await (
        await permit2
          .connect(spender)
          .invalidateUnorderedNonces(
            ethers.constants.Zero,
            ethers.constants.Two.pow(256).sub(ethers.constants.One),
          )
      ).wait();

      await expect(
        (
          await permit2.useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(0),
          )
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2.useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(1),
          )
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2.useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(254),
          )
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2.useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(255),
          )
        ).wait(),
      ).to.be.reverted;

      await (
        await permit2.useUnorderedNonce(
          spender.address,
          ethers.BigNumber.from(256),
        )
      ).wait();
    });
  });

  describe("Test Invalidate Non zero Word", function () {
    it("should fail 5", async function () {
      await (
        await permit2
          .connect(spender)
          .invalidateUnorderedNonces(
            ethers.constants.One,
            ethers.constants.Two.pow(256).sub(ethers.constants.One),
          )
      ).wait();

      await (
        await permit2.useUnorderedNonce(
          spender.address,
          ethers.BigNumber.from(0),
        )
      ).wait();
      await (
        await permit2.useUnorderedNonce(
          spender.address,
          ethers.BigNumber.from(254),
        )
      ).wait();
      await (
        await permit2.useUnorderedNonce(
          spender.address,
          ethers.BigNumber.from(255),
        )
      ).wait();

      await expect(
        (
          await permit2.useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(256),
          )
        ).wait(),
      ).to.be.reverted;
      await expect(
        (
          await permit2.useUnorderedNonce(
            spender.address,
            ethers.BigNumber.from(511),
          )
        ).wait(),
      ).to.be.reverted;

      await (
        await permit2.useUnorderedNonce(
          spender.address,
          ethers.BigNumber.from(512),
        )
      ).wait();
    });
  });

  describe("Test Using Nonce Twice Fails", function () {
    it("should fail 6", async function () {
      let nonce: BigNumberish = getRandomBigInt();
      await (await permit2.useUnorderedNonce(spender.address, nonce)).wait();

      await expect(
        (await permit2.useUnorderedNonce(spender.address, nonce)).wait(),
      ).to.be.reverted;
    });
  });

  describe("Test Use TwoRandom Nonces", function () {
    it("should fail 7", async function () {
      let first: BigNumberish = getRandomBigInt();
      let second: BigNumberish = getRandomBigInt();

      await (await permit2.useUnorderedNonce(spender.address, first)).wait();

      if (first == second) {
        await expect(
          (await permit2.useUnorderedNonce(spender.address, second)).wait(),
        ).to.be.reverted;
      } else {
        await (await permit2.useUnorderedNonce(spender.address, second)).wait();
      }
    });
  });

  describe("Test Invalidate Nonces Randomly", function () {
    it("should 8", async function () {
      let wordPos: BigNumberish = getRandomBigInt();
      let mask: BigNumberish = getRandomBigInt();

      await (
        await permit2.connect(spender).invalidateUnorderedNonces(wordPos, mask)
      ).wait();
      expect(
        await permit2.connect(spender).nonceBitmap(spender.address, wordPos),
      ).to.be.equal(mask);
    });
  });

  describe("Test Invalidate Two Nonces Randomly", function () {
    it("should 9", async function () {
      let wordPos: BigNumberish = getRandomBigInt();
      let startBitmap: BigNumberish = getRandomBigInt();
      let mask: BigNumberish = getRandomBigInt();

      await (
        await permit2
          .connect(spender)
          .invalidateUnorderedNonces(wordPos, startBitmap)
      ).wait();
      expect(
        await permit2.connect(spender).nonceBitmap(spender.address, wordPos),
      ).to.be.equal(startBitmap);

      let finalBitmap: BigNumberish = startBitmap.or(mask);

      await (
        await permit2.connect(spender).invalidateUnorderedNonces(wordPos, mask)
      ).wait();

      let savedBitmap: BigNumberish = await permit2
        .connect(spender)
        .nonceBitmap(spender.address, wordPos);
      expect(finalBitmap).to.be.equal(savedBitmap);

      await (
        await permit2.connect(spender).invalidateUnorderedNonces(wordPos, mask)
      ).wait();
      expect(await permit2.nonceBitmap(spender.address, wordPos)).to.be.equal(
        savedBitmap,
      );
    });
  });
});
