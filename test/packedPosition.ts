import { PackedPosition } from '../src/types';
import { assert } from 'chai';
import 'mocha';

describe('PackedPosition', () => {

    it('#pack #line #character', () => {
        
        let line = 123;
        let character = 456;
        let packed = PackedPosition.pack(line, character);

        assert.equal(PackedPosition.line(packed), line);
        assert.equal(PackedPosition.character(packed), character);

    });

    it('overflow', () => {

        let line = 0x1fffff;
        let character = 0xfff;
        let packed = PackedPosition.pack(line, character);

        assert.equal(PackedPosition.line(packed), 0xfffff);
        assert.equal(PackedPosition.character(packed), 0x7ff);

    });


});