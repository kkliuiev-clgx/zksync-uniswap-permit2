import {MockPermit2} from "../../typechain-types";
import {deployContract, provider} from "./shared/zkSyncUtils";
import fs from "fs";
import {Wallet} from "zksync-web3";
import {BigNumberish, ethers} from "ethers";
import {expect} from "./shared/expect";


const RICH_WALLET_PRIVATE_KEYS = JSON.parse(fs.readFileSync("test/zksync-tests/shared/rich-wallets.json", 'utf8'));

describe('NonceBitmap', function () {
    let permit2: MockPermit2;
    let owner: Wallet;
    let spender: Wallet;

    beforeEach(async function () {
        permit2 = <MockPermit2>await deployContract('MockPermit2');
        owner = new Wallet(RICH_WALLET_PRIVATE_KEYS[0].privateKey, provider);
        spender = new Wallet(RICH_WALLET_PRIVATE_KEYS[1].privateKey, provider);
    });

    describe('Test Low Nonces', function () {
        it('should tested', async function () {
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(5))).wait();
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(0))).wait();
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(1))).wait();

            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(1))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(5))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(0))).to.be.reverted;
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(4))).wait();
        });
    });

    describe('Test Nonce Word Boundary', function () {
        it('should fail2', async function () {
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(255))).wait();
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(256))).wait();

            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(255))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(256))).to.be.reverted;
        });
    });

    describe('Test High Nonces', function () {
        it('should fail3', async function () {
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(2).pow(240))).wait();
            await (await permit2.connect(spender).useUnorderedNonce(spender.address, (ethers.BigNumber.from(2).pow(240)).add(ethers.constants.One))).wait();

            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, ethers.BigNumber.from(2).pow(240))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.connect(spender).useUnorderedNonce(spender.address, (ethers.BigNumber.from(2).pow(240)).add(ethers.constants.One))).to.be.reverted;
        });
    });

    describe('Test Invalidate Full Word', function () {
        it('should fail 4', async function () {
            await (await permit2.connect(spender).invalidateUnorderedNonces(ethers.constants.Zero, ethers.constants.Two.pow(256).sub(ethers.constants.One))).wait();

            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(0))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(1))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(254))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(255))).to.be.reverted;
            await (await permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(256))).wait()
        });
    });

    describe('Test Invalidate Non zero Word', function () {
        it('should fail 5', async function () {
            await (await permit2.connect(spender).invalidateUnorderedNonces(ethers.constants.One, ethers.constants.Two.pow(256).sub(ethers.constants.One))).wait();

            await (await permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(0))).wait();
            await (await permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(254))).wait();
            await (await permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(255))).wait();
            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(256))).to.be.reverted;
            //vm.expectRevert(InvalidNonce.selector);
            await expect( permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(511))).to.be.reverted;
            await (await permit2.useUnorderedNonce(spender.address, ethers.BigNumber.from(512))).wait();
        });
    });

    describe('Test Using Nonce Twice Fails', function () {
        it('should fail 6', async function () {
            let nonce: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));
            await (await permit2.useUnorderedNonce(spender.address, nonce)).wait();

            //vm.expectRevert(InvalidNonce.selector);
            await expect(permit2.useUnorderedNonce(spender.address, nonce)).to.be.reverted;
        });
    });

    describe('Test Use TwoRandom Nonces', function () {
        it('should fail 7', async function () {
            let first: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));
            let second: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));

            await (await permit2.useUnorderedNonce(spender.address, first)).wait();

            if (first == second) {
                //vm.expectRevert(InvalidNonce.selector);
                await expect(permit2.useUnorderedNonce(spender.address, second)).to.be.reverted;
            } else {
                await (await permit2.useUnorderedNonce(spender.address, second)).wait();
            }
        });
    });

    describe('Test Invalidate Nonces Randomly', function () {
        it('should 8', async function () {
            let wordPos: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));
            let mask: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));

            await (await permit2.connect(spender).invalidateUnorderedNonces(wordPos, mask)).wait();
            expect(await permit2.connect(spender).nonceBitmap(spender.address, wordPos)).to.be.equal(mask);

        });
    });

    describe('Test Invalidate Two Nonces Randomly', function () {
        it('should 9', async function () {
            let wordPos: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));
            let startBitmap: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));
            let mask: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100));


            await (await permit2.connect(spender).invalidateUnorderedNonces(wordPos, startBitmap)).wait();

            expect(await permit2.connect(spender).nonceBitmap(spender.address, wordPos)).to.be.equal(startBitmap);

            // invalidating with the mask changes the original bitmap
            let finalBitmap: BigNumberish = startBitmap.or(mask);

            await (await permit2.connect(spender).invalidateUnorderedNonces(wordPos, mask)).wait();

            let savedBitmap: BigNumberish = await permit2.connect(spender).nonceBitmap(spender.address, wordPos);
            expect(finalBitmap).to.be.equal(savedBitmap);


            // invalidating with the same mask should do nothing
            await (await permit2.connect(spender).invalidateUnorderedNonces(wordPos, mask)).wait();
            expect(await permit2.nonceBitmap(spender.address, wordPos)).to.be.equal(savedBitmap);
        });
    });
});