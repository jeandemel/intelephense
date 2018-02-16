//converts json tree phrase and token constants to names
var fs = require('fs');
var path = require('path');
var lex = require('../lib/parser/lexer');
var phrase = require('../lib/parser/phrase');
var tree;

if (process.argv.length !== 3) {
    console.log('Usage: node toNamedJsonTree.js PATH_TO_FILE');
    return;
}

filepath = process.argv[2];
if (!path.isAbsolute(filepath)) {
    filepath = path.resolve(filepath);
}

fs.readFile(filepath, function (err, data) {
    if (err) {
        throw err;
    }

    tree = JSON.parse(data.toString());
    let replacer = (key, value) => {
        if(key === 'phraseType') {
            return phrase.phraseTypeToString(value);
        } else if(key === 'tokenType' || key === 'unexpected' || key === 'expected') {
            return lex.tokenTypeToString(value);
        } else {
            return value;
        }
    }

    console.log(JSON.stringify(tree, replacer, 4));

});