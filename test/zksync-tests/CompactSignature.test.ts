import {ethers} from "ethers";
import {expect} from "chai";



function getCompactSignature(vRaw: number, rRaw: string, sRaw: string): [string, string] {
    const v = vRaw - 27;
    const vs = ethers.utils.hexZeroPad(
        ethers.BigNumber.from(v).shl(255).add(ethers.BigNumber.from(sRaw)).toHexString(),
        32
    );
    return [rRaw, vs];
}

describe('CompactSignature', function () {

    it("should verify compact signature with v=27", async () => {
        const r = "0x68a020a209d3d56c46f38cc50a33f704f4a9a10a59377f8dd762ac66910e9b90";
        const s = "0x7e865ad05c4035ab5792787d4a0297a43617ae897930a6fe4d822b8faea52064";
        const v = 27;

        const vs = getCompactSignature(v, r, s);

        expect(vs[0]).to.equal("0x68a020a209d3d56c46f38cc50a33f704f4a9a10a59377f8dd762ac66910e9b90");
        expect(vs[1]).to.equal("0x7e865ad05c4035ab5792787d4a0297a43617ae897930a6fe4d822b8faea52064");
    });


    it("should verify compact signature with v=28", async () => {
        const r = "0x9328da16089fcba9bececa81663203989f2df5fe1faa6291a45381c81bd17f76";
        const s = "0x139c6d6b623b42da56557e5e734a43dc83345ddfadec52cbe24d0cc64f550793";
        const v = 28;

        const vs = getCompactSignature(v, r, s);

        expect(vs[0]).to.equal("0x9328da16089fcba9bececa81663203989f2df5fe1faa6291a45381c81bd17f76");
        expect(vs[1]).to.equal("0x939c6d6b623b42da56557e5e734a43dc83345ddfadec52cbe24d0cc64f550793");
    });

});