import {unshuffleWhileSwitch} from "../src/traverse";
import {runTest} from "./test-util";

describe('UnshuffleWhileSwitch', () => {
    it('unshuffle while switch', () => {
        const input = `{
    var _0xa2e247 = ("0|2|5|3|4|1")['split']('|'), _0x4417ad = 0;
    while (true) {
        switch (_0xa2e247[_0x4417ad++]) {
            case '0':
                var _0x8b8be3 = _0x204e90[_0x3146b7];
                continue;
            case '1':
                _0x316448 && ((_0x57d5be.length == _0x8b8be3.length || _0x8b8be3.indexOf('.') === 0) && (_0x57c620 = true));
                continue;
            case '2':
                var _0x515e87 = _0x8b8be3[0] === String.fromCharCode(46) ? _0x8b8be3.slice(1) : _0x8b8be3;
                continue;
            case '3':
                var _0x454f95 = _0x57d5be.indexOf(_0x515e87, _0x39e22e);
                continue;
            case '4':
                var _0x316448 = _0x454f95 !== -1 && _0x454f95 === _0x39e22e;
                continue;
            case '5':
                var _0x39e22e = _0x57d5be.length - _0x515e87.length;
                continue;
        }
        break;
    }
}`;
        const expected = `{
    var _0x8b8be3 = _0x204e90[_0x3146b7];
    var _0x515e87 = _0x8b8be3[0] === String.fromCharCode(46) ? _0x8b8be3.slice(1) : _0x8b8be3;
    var _0x39e22e = _0x57d5be.length - _0x515e87.length;
    var _0x454f95 = _0x57d5be.indexOf(_0x515e87, _0x39e22e);
    var _0x316448 = _0x454f95 !== -1 && _0x454f95 === _0x39e22e;
    _0x316448 && ((_0x57d5be.length == _0x8b8be3.length || _0x8b8be3.indexOf('.') === 0) && (_0x57c620 = true));
}`;
        runTest(input, expected, unshuffleWhileSwitch);
    });
});
