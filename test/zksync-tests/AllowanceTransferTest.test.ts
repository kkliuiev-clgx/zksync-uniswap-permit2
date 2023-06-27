import {MockERC20, Permit2} from "../../typechain-types";
import {deployContract, provider} from "./shared/zkSyncUtils";
import {Wallet} from "zksync-web3";
import fs from "fs";
import {BigNumber, BigNumberish, ethers} from "ethers";
import {
    AllowanceTransferDetails, getCompactPermitSignature, getPermitBatchSignature, getPermitSignature,
    PermitBatch,
    PermitSingle, TokenSpenderPair
} from "./utils/PermitSignature";
import {expect} from "./shared/expect";

const RICH_WALLET_PRIVATE_KEYS = JSON.parse(fs.readFileSync("test/zksync-tests/shared/rich-wallets.json", 'utf8'));
const DECIMAL_MULT: BigNumber = ethers.BigNumber.from(10).pow(ethers.BigNumber.from(18));

describe("AllowanceTransferTest", function () {

    const defaultExpiration: BigNumber = ethers.BigNumber.from(Date.now() + 50000);
    let token0: MockERC20;
    let token1: MockERC20;
    let permit2: Permit2;
    let from: Wallet;
    let fromDirty: Wallet;
    let spender: Wallet = new Wallet(RICH_WALLET_PRIVATE_KEYS[1].privateKey, provider);
    let receiver: Wallet = new Wallet(RICH_WALLET_PRIVATE_KEYS[2].privateKey, provider);
    let address3: Wallet = new Wallet(RICH_WALLET_PRIVATE_KEYS[3].privateKey, provider);

    let defaultAmount: BigNumber = DECIMAL_MULT
    let defaultNonce: BigNumberish = ethers.constants.Zero;
    let dirtyNonce: BigNumberish = ethers.constants.One;
    let MINT_AMOUNT_ERC20: BigNumber = defaultAmount.mul(10)

    let fromPrivateKey: string;
    let fromPrivateKeyDirty: string;
    let blockTimestampDebug: BigNumberish;


    beforeEach(async function () {

        let l1TimeStamp: number = 0;
        let l1BatchRange = await provider.getL1BatchBlockRange(
            await provider.getL1BatchNumber()
        );

        if (l1BatchRange) {
            l1TimeStamp = (await provider.getBlock(l1BatchRange[1])).l1BatchTimestamp;
        }


        blockTimestampDebug = ethers.BigNumber.from(l1TimeStamp + 80000000);

        permit2 = <Permit2>await deployContract('Permit2');

        fromPrivateKey = RICH_WALLET_PRIVATE_KEYS[0].privateKey;
        fromPrivateKeyDirty = RICH_WALLET_PRIVATE_KEYS[5].privateKey;

        from = new Wallet(fromPrivateKey, provider);
        fromDirty = new Wallet(fromPrivateKeyDirty, provider);

        token0 = <MockERC20>await deployContract('MockERC20', ["Test0", "TEST0", ethers.BigNumber.from(18)]);
        token1 = <MockERC20>await deployContract('MockERC20', ["Test1", "TEST1", ethers.BigNumber.from(18)]);

        await (await mint(from.address, from));

        await (await approve(permit2.address, from));

        await (await mint(fromDirty.address, fromDirty));

        await (await approve(permit2.address, fromDirty));

        await (await permit2.connect(fromDirty).invalidateNonces(token0.address, spender.address, dirtyNonce)).wait();
        await (await permit2.connect(fromDirty).invalidateNonces(token1.address, spender.address, dirtyNonce)).wait();


        await (await mint(receiver.address, receiver));

    });


    async function mint(address: string, from: Wallet) {
        await (await (token0.connect(from).mint(address, MINT_AMOUNT_ERC20))).wait();
        await (await (token1.connect(from).mint(address, MINT_AMOUNT_ERC20))).wait();
    }


    async function approve(address: string, from: Wallet) {
        await (await token0.connect(from).approve(address, ethers.constants.MaxUint256)).wait();
        await (await token1.connect(from).approve(address, ethers.constants.MaxUint256)).wait();
    }


    describe('Test Approve', function () {
        it('approve should work correct', async function () {
            await (await permit2.connect(from).approve(token0.address, spender.address, defaultAmount, defaultExpiration)).wait();

            let result = await permit2.allowance(from.address, token0.address, spender.address);
            expect(result.amount).to.be.equal(defaultAmount);
            expect(result.expiration).to.be.equal(defaultExpiration);
            expect(result.nonce).to.be.equal(0);
        });
    });


    describe('Test set allowance', function () {
        it('permit should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };
            const {
                v,
                r,
                s
            } = getPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, ethers.utils.concat([r, s, ethers.utils.hexlify(v)]))).wait();

            let result = await permit2.connect(from).allowance(from.address, token0.address, spender.address);

            expect(result.amount).to.be.equal(defaultAmount);
            expect(result.expiration).to.be.equal(defaultExpiration);
            expect(result.nonce).to.be.equal(ethers.constants.One);
        });
    });


    describe('Test Set Allowance CompactSig', function () {
        it('allowance with compact sig should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };
            let signature: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());
            expect(signature.length).to.be.eq(64)

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, signature)).wait();
            let allowanceResult = await permit2.connect(from).allowance(from.address, token0.address, spender.address);

            expect(allowanceResult.amount).to.be.equal(defaultAmount);
            expect(allowanceResult.expiration).to.be.equal(defaultExpiration);
            expect(allowanceResult.nonce).to.be.equal(ethers.constants.One);
        });
    });


    describe('Test Set Allowance Incorrect Sig Length', function () {
        it('allowance with incorrect sig length should revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };

            let signature: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());
            let signatureExtra: Uint8Array = ethers.utils.concat([signature, [0], [1]]);
            expect(signatureExtra.length).to.be.equal(66);

            await expect(permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, signatureExtra)).to.be.reverted;
        });
    });


    describe('Test Set Allowance Dirty Write', function () {
        it('allowance dirty write should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: dirtyNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };
            let signature: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKeyDirty, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(fromDirty)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](fromDirty.address, permitSingle, signature)).wait();

            let allowanceResult = await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address);

            expect(allowanceResult.amount).to.be.equal(defaultAmount);
            expect(allowanceResult.expiration).to.be.equal(defaultExpiration);
            expect(allowanceResult.nonce).to.be.equal(ethers.constants.Two);
        });
    });


    describe('Test Set Allowance Batch Different Nonces', function () {
        it('AllowanceBatch with different nonces should not revert', async function () {

            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            let signature: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, signature)).wait();

            let allowanceResult = await permit2.connect(from).allowance(from.address, token0.address, spender.address);

            expect(allowanceResult.amount).to.be.equal(defaultAmount);
            expect(allowanceResult.expiration).to.be.equal(defaultExpiration);
            expect(allowanceResult.nonce).to.be.equal(ethers.constants.One);

            let address: string[] = [token0.address, token1.address];


            let permitBatch: PermitBatch = {
                details: [{
                    token: address[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: dirtyNonce
                },
                    {
                        token: address[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: 0
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };

            let signatureBatch: string = getPermitBatchSignature(permitBatch, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](from.address, permitBatch, signatureBatch)).wait();

            let allowanceBatchResult0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(allowanceBatchResult0.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult0.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult0.nonce).to.be.equal(ethers.constants.Two);

            let allowanceBatchResult1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(allowanceBatchResult1.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult1.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult1.nonce).to.be.equal(ethers.constants.One);


        });
    });

    describe('Test Set Allowance Batch', function () {
        it('permit should not revert', async function () {
            let tokens: string[] = [token0.address, token1.address];

            let permitBatch: PermitBatch = {
                details: [{
                    token: tokens[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce
                },
                    {
                        token: tokens[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: defaultNonce
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };

            const sign = getPermitBatchSignature(permitBatch, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](from.address, permitBatch, sign)).wait();

            let allowanceBatchResult0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(allowanceBatchResult0.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult0.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult0.nonce).to.be.equal(ethers.constants.One);

            let allowanceBatchResult1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(allowanceBatchResult1.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult1.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult1.nonce).to.be.equal(ethers.constants.One);
        });
    });


    describe('Test Set Allowance Batch Event', function () {
        it('permit should not revert', async function () {
            let tokens: string[] = [token0.address, token1.address];

            let permitBatch: PermitBatch = {
                details: [{
                    token: tokens[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce
                },
                    {
                        token: tokens[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: defaultNonce
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };


            const sign: string = getPermitBatchSignature(permitBatch, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](from.address, permitBatch, sign)).wait();


            let allowanceBatchResult0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(allowanceBatchResult0.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult0.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult0.nonce).to.be.equal(ethers.constants.One);

            let allowanceBatchResult1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(allowanceBatchResult1.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult1.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult1.nonce).to.be.equal(ethers.constants.One);
        });
    });

    describe('Test Set Allowance Batch Dirty Write', function () {
        it('permit should not revert', async function () {
            let tokens: string[] = [token0.address, token1.address];

            let permitBatch: PermitBatch = {
                details: [{
                    token: tokens[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: dirtyNonce
                },
                    {
                        token: tokens[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: dirtyNonce
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };


            const sign: string = getPermitBatchSignature(permitBatch, fromPrivateKeyDirty, await permit2.DOMAIN_SEPARATOR());


            await (await permit2.connect(fromDirty)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](fromDirty.address, permitBatch, sign)).wait();


            let allowanceBatchResult0 = await (await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address));
            expect(allowanceBatchResult0.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult0.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult0.nonce).to.be.equal(ethers.constants.Two);

            let allowanceBatchResult1 = await (await permit2.connect(fromDirty).allowance(fromDirty.address, token1.address, spender.address));
            expect(allowanceBatchResult1.amount).to.be.equal(defaultAmount);
            expect(allowanceBatchResult1.expiration).to.be.equal(defaultExpiration);
            expect(allowanceBatchResult1.nonce).to.be.equal(ethers.constants.Two);
        });
    });


    describe('Test SetAllowanceTransfer', function () {
        it('SetAllowanceTransfer should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let allowanceResult = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));

            expect(allowanceResult.amount).to.be.equal(defaultAmount);

            await (await permit2.connect(spender)["transferFrom(address,address,uint160,address)"](from.address, ethers.constants.AddressZero, defaultAmount, token0.address)).wait();

            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(defaultAmount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(defaultAmount));

        });
    });

    describe('Test TransferFrom With GasSnapshot', function () {
        it('transferFrom should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumber = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumber = await token0.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let allowanceResult = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(allowanceResult.amount).to.be.equal(defaultAmount);

            await (await permit2.connect(spender)["transferFrom(address,address,uint160,address)"](from.address, ethers.constants.AddressZero, defaultAmount, token0.address)).wait();

            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(defaultAmount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(defaultAmount));
        });
    });

    describe('Test Batch TransferFrom With Gas Snapshot', function () {
        it('transferFrom should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount.mul(3),
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await token0.mint(from.address, defaultAmount.mul(3))).wait();

            let startBalanceFrom: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);
            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let allowanceResult = await permit2.connect(from).allowance(from.address, token0.address, spender.address);
            expect(allowanceResult.amount).to.be.equal(defaultAmount.mul(3));

            let owners = [];
            owners.push(from.address);
            owners.push(from.address);
            owners.push(from.address);

            let transferDetails: AllowanceTransferDetails[] = [];
            transferDetails.push({
                token: token0.address,
                amount: defaultAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            transferDetails.push({
                token: token0.address,
                amount: defaultAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            transferDetails.push({
                token: token0.address,
                amount: defaultAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });


            await (await permit2.connect(spender)["transferFrom((address,address,uint160,address)[])"](transferDetails)).wait();

            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(defaultAmount.mul(3)));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(defaultAmount.mul(3)));
        });
    });


    describe('Test Set Allowance Transfer DirtyNonce Dirty Transfer', function () {
        it('transferFrom should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: dirtyNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKeyDirty, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumberish = await token0.balanceOf(fromDirty.address);

            await (await token0.mint(address3.address, defaultAmount)).wait();
            let startBalanceTo: BigNumberish = await token0.balanceOf(address3.address);

            expect(startBalanceTo).to.be.equal(defaultAmount);

            await (await permit2.connect(fromDirty)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](fromDirty.address, permitSingle, sign)).wait();

            let allowanceResult = await (await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address));
            expect(allowanceResult.amount).to.be.equal(defaultAmount);

            await (await permit2.connect(spender)["transferFrom(address,address,uint160,address)"](fromDirty.address, address3.address, defaultAmount, token0.address)).wait();

            expect(await token0.balanceOf(fromDirty.address)).to.be.equal(startBalanceFrom.sub(defaultAmount));
            expect(await token0.balanceOf(address3.address)).to.be.equal(startBalanceTo.add(defaultAmount));
        });
    });


    describe('Test Set Allowance Invalid Signature', function () {
        it('permit with invalid signature should revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKeyDirty, await permit2.DOMAIN_SEPARATOR());

            permitSingle = {...permitSingle};
            permitSingle.spender = ethers.constants.AddressZero;
            await expect(permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).to.be.reverted;

        });
    });


    describe('Test Set Allowance Deadline Passed', function () {
        it('permit with passed deadline should revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: ethers.constants.Two,
            };

            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());
            await expect(permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).to.be.reverted;

        });
    });


    describe('Test Max Allowance', function () {
        it('transferFrom should not revert', async function () {
            let maxAllowance = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffff');

            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: maxAllowance,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            const sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let allowanceResult = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));

            expect(allowanceResult.amount).to.be.equal(maxAllowance);

            await (await permit2.connect(spender)["transferFrom(address,address,uint160,address)"](from.address, ethers.constants.AddressZero, defaultAmount, token0.address)).wait();

            allowanceResult = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));

            expect(allowanceResult.amount).to.be.equal(maxAllowance);
            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(defaultAmount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(defaultAmount));
        });
    });


    describe('Test Max Allowance Dirty Write', function () {
        it('max allowance transferFrom should not revert', async function () {
            let maxAllowance = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffff');
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: maxAllowance,
                    expiration: defaultExpiration,
                    nonce: dirtyNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKeyDirty, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumberish = await token0.balanceOf(fromDirty.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(fromDirty)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](fromDirty.address, permitSingle, sign)).wait();

            let startAllowedAmount0 = (await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address));
            expect(startAllowedAmount0.amount).to.be.equal(maxAllowance)
            await (await permit2.connect(spender)["transferFrom(address,address,uint160,address)"](fromDirty.address, ethers.constants.AddressZero, defaultAmount, token0.address)).wait();

            let endAllowedAmount0 = (await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address));
            expect(endAllowedAmount0.amount).to.be.equal(maxAllowance)

            expect(await token0.balanceOf(fromDirty.address)).to.be.equal(startBalanceFrom.sub(defaultAmount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(defaultAmount));
        });
    });


    describe('Test Partial Allowance', function () {
        it('Partial Allowance should not reverted', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());
            let transferAmount: BigNumberish = ethers.BigNumber.from(5).pow(18);

            let startBalanceFrom: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let startAllowedAmount0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(startAllowedAmount0.amount).to.be.equal(defaultAmount);
            await (await permit2.connect(spender)["transferFrom(address,address,uint160,address)"](from.address, ethers.constants.AddressZero, transferAmount, token0.address)).wait();

            let endAllowedAmount0 = await permit2.connect(from).allowance(from.address, token0.address, spender.address);
            expect(endAllowedAmount0.amount).to.be.equal(defaultAmount.sub(transferAmount));

            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(transferAmount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(transferAmount));
        });
    });


    describe('Test Reuse Ordered Nonce Invalid', function () {
        it('Reused Ordered Nonce Invalid should reverted', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let result = await permit2.connect(from).allowance(from.address, token0.address, spender.address);
            expect(result.nonce).to.be.equal(ethers.constants.One);
            expect(result.amount).to.be.equal(defaultAmount);
            expect(result.expiration).to.be.equal(defaultExpiration);

            await expect(permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).to.be.reverted;
        });
    });


    describe('Test Invalidate Nonces', function () {
        it('Invalidate Nonces should revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from).invalidateNonces(token0.address, spender.address, ethers.BigNumber.from(1))).wait();

            let result = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));

            expect(result.nonce).to.be.equal(1);

            await expect(permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).to.be.reverted;
        });
    });


    describe('Test Invalidate Multiple Nonces', function () {
        it('Invalidate Multiple Nonces should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();

            let result = await permit2.connect(from).allowance(from.address, token0.address, spender.address);
            expect(result.nonce).to.be.equal(ethers.constants.One);

            permitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: result.nonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };


            sign = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());


            await (await permit2.connect(from).invalidateNonces(token0.address, spender.address, ethers.BigNumber.from(33))).wait();

            result = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result.nonce).to.be.equal(ethers.BigNumber.from(33));


            //should revert
            await expect(permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).to.be.reverted;
        });
    });


    describe('Test Invalidate Nonces Invalid', function () {
        it('Invalidate Nonces Invalid should not revert ', async function () {
            await expect(permit2.connect(fromDirty).invalidateNonces(token0.address, spender.address, ethers.constants.Zero)).to.be.reverted;
        });
    });


    describe('Test Excessive Invalidation', function () {
        it('ExcessiveInvalidation should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());
            let numInvalidate: BigNumberish = ethers.utils.parseUnits('65535', 0);

            await expect(permit2.connect(from).invalidateNonces(token0.address, spender.address, numInvalidate.add(ethers.constants.One))).to.be.reverted;

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();
            let result = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result.nonce).to.be.equal(ethers.constants.One);
        });
    });


    describe('Test BatchTransferFrom', function () {
        it('BatchTransferFrom should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();
            let result = await permit2.connect(from).allowance(from.address, token0.address, spender.address);

            expect(result.amount).to.be.equal(defaultAmount);

            let transferDetails: AllowanceTransferDetails[] = [];
            let transferAmount: BigNumber = ethers.BigNumber.from(1)
            transferDetails.push({
                token: token0.address,
                amount: transferAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            transferDetails.push({
                token: token0.address,
                amount: transferAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            transferDetails.push({
                token: token0.address,
                amount: transferAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            await (await permit2.connect(spender)["transferFrom((address,address,uint160,address)[])"](transferDetails)).wait();

            let amount: BigNumberish = transferAmount.mul(3)
            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(amount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo.add(amount));

            result = await permit2.connect(from).allowance(from.address, token0.address, spender.address);
            expect(result.amount).to.be.equal(defaultAmount.sub(amount));
        });
    });


    describe('Test BatchTransferFrom MultiToken', function () {
        it('BatchTransferFrom should not revert', async function () {
            let tokens: string[] = [token0.address, token1.address];

            let permitBatch: PermitBatch = {
                details: [{
                    token: tokens[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce
                },
                    {
                        token: tokens[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: defaultNonce
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };

            const sign: string = getPermitBatchSignature(permitBatch, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());


            let startBalanceFrom0: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceFrom1: BigNumberish = await token1.balanceOf(from.address);
            let startBalanceTo0: BigNumberish = await token0.balanceOf(ethers.constants.AddressZero);
            let startBalanceTo1: BigNumberish = await token1.balanceOf(ethers.constants.AddressZero);

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](from.address, permitBatch, sign)).wait();

            let result0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(defaultAmount);

            let result1 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result1.amount).to.be.equal(defaultAmount);

            let owners = [];
            owners.push(from.address);
            owners.push(from.address);

            let transferDetails: AllowanceTransferDetails[] = [];
            let transferAmount: BigNumber = ethers.BigNumber.from(1)
            transferDetails.push({
                token: token0.address,
                amount: transferAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            transferDetails.push({
                token: token1.address,
                amount: transferAmount,
                from: from.address,
                to: ethers.constants.AddressZero
            });

            await (await permit2.connect(spender)["transferFrom((address,address,uint160,address)[])"](transferDetails)).wait();

            let amount: BigNumberish = ethers.constants.One.pow(18);
            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom0.sub(amount));
            expect(await token1.balanceOf(from.address)).to.be.equal(startBalanceFrom1.sub(amount));

            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo0.add(amount));
            expect(await token0.balanceOf(ethers.constants.AddressZero)).to.be.equal(startBalanceTo1.add(amount));

            result0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(defaultAmount.sub(amount));
            result1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(result1.amount).to.be.equal(defaultAmount.sub(amount));
        });
    });


    describe('Test BatchTransferFrom Different Owners', function () {
        it('BatchTransferFrom should not revert', async function () {
            let permitSingle: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            let sign: Uint8Array = getCompactPermitSignature(permitSingle, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());


            let permitSingleDirty: PermitSingle = {
                details: {
                    token: token0.address,
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: dirtyNonce,
                },
                spender: spender.address,
                sigDeadline: blockTimestampDebug,
            };

            let signDirty: Uint8Array = getCompactPermitSignature(permitSingleDirty, fromPrivateKeyDirty, await permit2.DOMAIN_SEPARATOR());

            let startBalanceFrom: BigNumberish = await token0.balanceOf(from.address);
            let startBalanceTo: BigNumberish = await token0.balanceOf(spender.address);
            let startBalanceFromDirty: BigNumberish = await token0.balanceOf(fromDirty.address);


            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](from.address, permitSingle, sign)).wait();
            await (await permit2.connect(fromDirty)["permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"](fromDirty.address, permitSingleDirty, signDirty)).wait();


            let result0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(defaultAmount);
            let result1 = await (await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address));
            expect(result1.amount).to.be.equal(defaultAmount);

            let transferDetails: AllowanceTransferDetails[] = [];
            let transferAmount: BigNumber = ethers.constants.One.pow(18);
            transferDetails.push({
                token: token0.address,
                amount: transferAmount,
                from: from.address,
                to: spender.address
            });

            transferDetails.push({
                token: token0.address,
                amount: transferAmount,
                from: fromDirty.address,
                to: spender.address
            });

            await (await permit2.connect(spender)["transferFrom((address,address,uint160,address)[])"](transferDetails)).wait();


            let amount: BigNumberish = ethers.BigNumber.from(2).mul(ethers.constants.One.pow(18))
            expect(await token0.balanceOf(from.address)).to.be.equal(startBalanceFrom.sub(transferAmount));
            expect(await token0.balanceOf(fromDirty.address)).to.be.equal(startBalanceFromDirty.sub(transferAmount));
            expect(await token0.balanceOf(spender.address)).to.be.equal(startBalanceTo.add(amount));

            result0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(defaultAmount.sub(transferAmount));
            result1 = await (await permit2.connect(fromDirty).allowance(fromDirty.address, token0.address, spender.address));
            expect(result1.amount).to.be.equal(defaultAmount.sub(transferAmount));
        });
    });


    describe('Test Lockdown', function () {
        it('should pass lockdown test', async function () {
            let tokens: string[] = [token0.address, token1.address];

            let permitBatch: PermitBatch = {
                details: [{
                    token: tokens[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce
                },
                    {
                        token: tokens[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: defaultNonce
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };


            const sign: string = getPermitBatchSignature(permitBatch, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](from.address, permitBatch, sign)).wait();

            let result0 = await permit2.connect(from).allowance(from.address, token0.address, spender.address);

            expect(result0.amount).to.be.equal(defaultAmount);
            expect(result0.expiration).to.be.equal(defaultExpiration);
            expect(result0.nonce).to.be.equal(ethers.constants.One)

            let result1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(result1.amount).to.be.equal(defaultAmount);
            expect(result1.expiration).to.be.equal(defaultExpiration);
            expect(result1.nonce).to.be.equal(ethers.constants.One)

            let approvals: TokenSpenderPair[] = [];

            approvals.push({
                token: token0.address,
                spender: spender.address
            });

            approvals.push({
                token: token1.address,
                spender: spender.address
            });

            await (await permit2.connect(from).lockdown(approvals)).wait();

            result0 = (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(ethers.constants.Zero);
            expect(result0.expiration).to.be.equal(defaultExpiration);
            expect(result0.nonce).to.be.equal(ethers.constants.One);

            result1 = (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(result1.amount).to.be.equal(ethers.constants.Zero);
            expect(result1.expiration).to.be.equal(defaultExpiration);
            expect(result1.nonce).to.be.equal(ethers.constants.One);

        });
    });


    describe('Test Lockdown Event', function () {
        it('should pass lockdown', async function () {
            let tokens: string[] = [token0.address, token1.address];

            let permitBatch: PermitBatch = {
                details: [{
                    token: tokens[0],
                    amount: defaultAmount,
                    expiration: defaultExpiration,
                    nonce: defaultNonce
                },
                    {
                        token: tokens[1],
                        amount: defaultAmount,
                        expiration: defaultExpiration,
                        nonce: defaultNonce
                    }],
                spender: spender.address,
                sigDeadline: blockTimestampDebug
            };
            const sign: string = getPermitBatchSignature(permitBatch, fromPrivateKey, await permit2.DOMAIN_SEPARATOR());

            await (await permit2.connect(from)["permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)"](from.address, permitBatch, sign)).wait();

            let result0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(defaultAmount);
            expect(result0.expiration).to.be.equal(defaultExpiration);
            expect(result0.nonce).to.be.equal(ethers.constants.One);

            let result1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(result1.amount).to.be.equal(defaultAmount);
            expect(result1.expiration).to.be.equal(defaultExpiration);
            expect(result1.nonce).to.be.equal(ethers.constants.One);


            let approvals: TokenSpenderPair[] = [];

            approvals.push({
                token: token0.address,
                spender: spender.address
            });

            approvals.push({
                token: token1.address,
                spender: spender.address
            });
            await (await permit2.connect(from).lockdown(approvals)).wait();


            result0 = await (await permit2.connect(from).allowance(from.address, token0.address, spender.address));
            expect(result0.amount).to.be.equal(ethers.constants.Zero);
            expect(result0.expiration).to.be.equal(defaultExpiration);
            expect(result0.nonce).to.be.equal(ethers.constants.One);

            result1 = await (await permit2.connect(from).allowance(from.address, token1.address, spender.address));
            expect(result1.amount).to.be.equal(ethers.constants.Zero);
            expect(result1.expiration).to.be.equal(defaultExpiration);
            expect(result1.nonce).to.be.equal(ethers.constants.One);
        });
    });

});