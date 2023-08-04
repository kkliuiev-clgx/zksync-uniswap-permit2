import fs from "fs";
import {Wallet} from "zksync-web3";
import {deployContract, provider} from "./shared/zkSyncUtils";
import {MockERC20, MockPermit2} from "../../typechain-types";
import {BigNumber, BigNumberish, ethers} from "ethers";
import {expect} from "./shared/expect";

const RICH_WALLET_PRIVATE_KEYS = JSON.parse(fs.readFileSync("test/zksync-tests/shared/rich-wallets.json", 'utf8'));

describe('AllowanceUnitTest', function () {
    const from: Wallet = new Wallet(RICH_WALLET_PRIVATE_KEYS[3].privateKey, provider);
    const spender: Wallet = new Wallet(RICH_WALLET_PRIVATE_KEYS[4].privateKey, provider);

    let permit2: MockPermit2;
    let token0: MockERC20;
    let token1: MockERC20;

    beforeEach(async function () {
        permit2 = <MockPermit2>await deployContract('MockPermit2');
        token0 = <MockERC20>await deployContract('MockERC20', ["Test0", "TEST0", ethers.BigNumber.from(18)]);
        token1 = <MockERC20>await deployContract('MockERC20', ["Test1", "TEST1", ethers.BigNumber.from(18)]);
    });

    describe('Test Update Amount Expiration Randomly', function () {
        it('should update allowance', async function () {
            let amount: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));
            let expiration: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));

            let token: string = token1.address;

            let allowanceResult = (await permit2.connect(from).allowance(from.address, token, spender.address));

            await (await permit2.mockUpdateAmountAndExpiration(from.address, token, spender.address, amount, expiration)).wait();

            let l1TimeStamp: BigNumberish = ethers.constants.Zero;
            let l1BatchRange = await (await provider.getL1BatchBlockRange(await provider.getL1BatchNumber()));
            if (l1BatchRange) {
                l1TimeStamp = (await provider.getBlock(l1BatchRange[1])).l1BatchTimestamp;
            } else {
                console.log('l1TimeStamp INCORRECT(NULL)');
            }

            let timestampAfterUpdate: BigNumberish = (expiration.eq(ethers.constants.Zero)) ? l1TimeStamp : expiration;

            let allowanceResultAfter = await permit2.connect(from).allowance(from.address, token, spender.address);
          
            expect(allowanceResultAfter.amount).to.be.equal(amount);
            expect(timestampAfterUpdate).to.be.equal(expiration);
            expect(allowanceResultAfter.nonce).to.be.equal(allowanceResult.nonce);

        });
    })

    describe('Test Update All Randomly', function () {
        it('should update randomly', async function () {
            let amount: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));
            let expiration: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));
            let nonce: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));

            let token: string = token1.address;

            await (await permit2.mockUpdateAll(from.address, token, spender.address, amount, expiration, nonce)).wait();

            let nonceAfterUpdate: BigNumber = nonce.add(ethers.constants.One);

            let l1TimeStamp: BigNumberish = ethers.constants.Zero;
            let l1BatchRange = await (await provider.getL1BatchBlockRange(
                await provider.getL1BatchNumber()));
            if (l1BatchRange) {
                l1TimeStamp = (await provider.getBlock(l1BatchRange[1])).l1BatchTimestamp;
            } else {
                console.log('l1TimeStamp INCORRECT(NULL)');
            }

            let timestampAfterUpdate: BigNumberish = (expiration.eq(ethers.constants.Zero)) ? l1TimeStamp : expiration;

            let allowanceResultAfter = (await permit2.connect(from).allowance(from.address, token, spender.address));

            expect(allowanceResultAfter.amount).to.be.equal(amount);
            expect(timestampAfterUpdate).to.be.equal(expiration);
            expect(allowanceResultAfter.nonce).to.be.equal(nonceAfterUpdate);
        });
    })

    describe('Test Pack And Unpack', function () {
        it('should pass the pack and unpack', async function () {
            let amount: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));
            let expiration: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));
            let nonce: BigNumberish = ethers.BigNumber.from(Math.floor(Math.random() * 100 + 1));

            let word: BigNumberish = (nonce.shl(208)).or(expiration.shl(160).or(amount));

            await (await permit2.doStore(from.address, token1.address, spender.address, word)).wait();

            let allowanceResultAfter = (await permit2.connect(from).allowance(from.address, token1.address, spender.address));

            expect(allowanceResultAfter.amount).to.be.equal(amount);
            expect(allowanceResultAfter.expiration).to.be.equal(expiration);
            expect(allowanceResultAfter.nonce).to.be.equal(nonce);

            let wordFromStore = (await permit2.getStore(from.address, token1.address, spender.address));

            expect(wordFromStore).to.be.equal(word);
        });
    })
});
