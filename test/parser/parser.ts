import 'mocha';
import { assert } from 'chai';
import * as path from'path';
import {Parser} from '../../src/parser/parser';
import * as fs from 'fs';

let testDir = path.join(__dirname, 'cases');
describe("parser", () => {

    let list = fs.readdirSync(testDir);
    list.forEach(function (file) {
        var filepath = path.join(testDir, file);
        if (path.extname(filepath) !== '.php') {
            return;
        }
        var phpData = fs.readFileSync(filepath);
        let actual = Parser.parse(phpData.toString());

        let jsonData = fs.readFileSync(filepath + '.json');
        let expected = JSON.parse(jsonData.toString());

        it(filepath, function () {
            assert.deepEqual(actual, expected);
        });

    });

});
