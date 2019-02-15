var Twig = require("@wiwo/twig");
replaceTokens(Twig);

var path = require("path");
var hashGenerator = require("hasha");
var mapcache = require("./mapcache");
var compilerFactory = require("./compiler");
var getOptions = require("./getOptions");
Twig.cache(false);

module.exports = function(source) {
    var path = require.resolve(this.resource),
        id = hashGenerator(path),
        options = getOptions(this),
        tpl;
    let callback = this.async();
    
    options.resolve = (path, cb) => {
        this.resolve(this.context, path, cb);
    };
    
    Twig.extend(function(Twig) {
        var compiler = Twig.compiler;
        compiler.module['webpack'] = compilerFactory(options);
    });

    mapcache.set(id, path)

    this.cacheable && this.cacheable();
    
    let tplPromise;
    try {
        tpl = Twig.twig({
            id: id,
            path: path,
            data: source,
            allowInlineIncludes: true
        });
        
        tplPromise = tpl.compile({
            module: 'webpack',
            
            // `pathToTwig` -> used in `require()` statements
            twig: '@wiwo/twig'
        });
    } catch (err){
        tplPromise = Promise.reject(err);
    }
    
    tplPromise
        .then((tpl) => {
            callback(null, tpl);
        })
        .catch((err) => {
            callback(err);
        });
    
};

function replaceTokens(Twig){
    Twig.token.definitions = [
        {
            type: Twig.token.type.raw,
            open: '<% raw %}',
            close: '<% endraw %}'
        },
        {
            type: Twig.token.type.raw,
            open: '<% verbatim %}',
            close: '<% endverbatim %}'
        },
        // *Whitespace type tokens*
        //
        // These typically take the form `{{- expression -}}` or `{{- expression }}` or `{{ expression -}}`.
        {
            type: Twig.token.type.output_whitespace_pre,
            open: '<%=-',
            close: '%>'
        },
        
        /*
        2019-01-30 CFH:
        twig.js doesn't handle custom delimiters very well.
        I've customised it to expose `Twig.token` so we can set these new definitions,
        however it also makes assumptions about the *length* of the opening and closing delimiters.
        
        I'm commenting out this `Twig.token.type.output_whitespace_post` definition because it ends
        up getting matched before `<%= %>`, causing erroneous errors. We don't really need this
        specific whitespace slurping delimiter anyway - better to have it working at all!
        */
        // {
        //     type: Twig.token.type.output_whitespace_post,
        //     open: '<%=',
        //     close: '-%>'
        // },
        {
            type: Twig.token.type.output_whitespace_both,
            open: '<%=-',
            close: '-%>'
        },
        {
            type: Twig.token.type.logic_whitespace_pre,
            open: '<%-',
            close: '%>'
        },
        {
            type: Twig.token.type.logic_whitespace_post,
            open: '<%',
            close: '-%>'
        },
        {
            type: Twig.token.type.logic_whitespace_both,
            open: '<%-',
            close: '-%>'
        },
        // *Output type tokens*
        //
        // These typically take the form `{{ expression }}`.
        {
            type: Twig.token.type.output,
            open: '<%=',
            close: '%>'
        },
        // *Logic type tokens*
        //
        // These typically take a form like `{% if expression %}` or `{% endif %}`
        {
            type: Twig.token.type.logic,
            open: '<%',
            close: '%>'
        },
        // *Comment type tokens*
        //
        // These take the form `{# anything #}`
        {
            type: Twig.token.type.comment,
            open: '<%#',
            close: '%>'
        }
    ];
}
