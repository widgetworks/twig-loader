var _path = require("path");
var hashGenerator = require("hasha");
var _ = require("lodash");
var loaderUtils = require("loader-utils");
var mapcache = require("./mapcache");

module.exports = function(options) {
    return function(id, tokens, pathToTwig) {
        var includes = [];
        var resourcePath = mapcache.get(id);
        var processDependency = function(token, tokenParent) {
            return new Promise((resolve, reject) => {
                options.resolve(token.value, (err, path, result) => {
                    
                    // Attempt to resolve with Webpack, falling back to standard behaviour otherwise.
                    let finalPath = path;
                    if (err){
                        if (err.hasOwnProperty('missing')){
                            // webpack couldn't resolve the file, but that's ok.
                            console.warn(`(twig-loaded) unable to resolve path: ${token.value} (from inside "${resourcePath}"`);
                            
                            // // Fall back to standard behaviour otherwise.
                            // finalPath = _path.resolve(_path.dirname(resourcePath), token.value);
                        } 
                        
                        if (!tokenParent.ignoreMissing){
                            // Some other error
                            reject(err);
                            return;
                        }
                    }
                    
                    if (!err){
                        includes.push(token.value);
                        token._originalPath = token.value;
                        token.value = hashGenerator(finalPath);
                    }
                    
                    resolve(token);
                });
            });
            
        };

        var processToken = function(token) {
            let promises;
            if (token.type == "logic" && token.token.type) {
                switch(token.token.type) {
                    case 'Twig.logic.type.block':
                    case 'Twig.logic.type.if':
                    case 'Twig.logic.type.elseif':
                    case 'Twig.logic.type.else':
                    case 'Twig.logic.type.for':
                    case 'Twig.logic.type.spaceless':
                    case 'Twig.logic.type.macro':
                        promises = _.flatMap(token.token.output, processToken);
                        break;
                    case 'Twig.logic.type.extends':
                    case 'Twig.logic.type.include':
                    case 'Twig.logic.type.use':
                        promises = _.map(token.token.stack, (curToken) => {
                            return processDependency(curToken, token.token);
                        });
                        break;
                    case 'Twig.logic.type.embed':
                        promises = _.flatMap(token.token.output, processToken);
                        promises = promises.concat(
                            _.map(token.token.stack, (curToken) => {
                                return processDependency(curToken, token.token);
                            })
                        );
                        break;
                    case 'Twig.logic.type.import':
                    case 'Twig.logic.type.from':
                        if (token.token.expression != '_self') {
                            promises = _.map(token.token.stack, (curToken) => {
                                return processDependency(curToken, token.token);
                            });
                        }
                        break;
                }
            }
            
            return promises;
        };
        
        let tplPromise;
        if (tokens){
            var parsedTokens = JSON.parse(tokens);
            
            let tokenPromises = _.flatMap(parsedTokens, processToken)
                .filter(x => x);
            
            tplPromise = Promise.all(tokenPromises)
                .then(() => {
                    var opts = Object.assign({}, options.twigOptions, {
                        id: id,
                        data: parsedTokens,
                        allowInlineIncludes: true,
                        rethrow: true,
                    });
                    var output = [`
var twig = require("${pathToTwig}").twig;
var template = twig(${JSON.stringify(opts)});
module.exports = function(context) { return template.render(context); }
`,
                    ];
            
                    if (includes.length > 0) {
                        _.each(_.uniq(includes), function(file) {
                            output.unshift(`require(${JSON.stringify(file)});`);
                        });
                    }
            
                    return output.join('\n');
                });
        } else {
            // debugger;
            
            let templateEntries = Object.entries(mapcache.__data__);
            let knownTemplates = `mapcache entries=${JSON.stringify(templateEntries, null, 2)}`;
            
            tplPromise = Promise.reject(`(twig-loader) invalid tokens - there was probably an error\n\n${knownTemplates}`);
        }
        
        return tplPromise;
    };
};
