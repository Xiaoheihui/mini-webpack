const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default; // traverse 采用的 ES Module 导出，我们通过 requier 引入的话就加个 .default
const babel = require('@babel/core');
const { entry } = require('./mini-webpack.config');

const parseModule = filename => {
    const fileBuffer = fs.readFileSync(filename, 'utf-8');
    const ast = parser.parse(fileBuffer, { sourceType: 'module' });

    const dependencies = {};

    traverse(ast, {
        ImportDeclaration({node}){
            const dirname = path.dirname(filename);
            const newDirname = './' + path.join(dirname, node.source.value).replace('\\', '/');
            dependencies[node.source.value] = newDirname;
        }
    })

    const { code } = babel.transformFromAst(ast, null, {
        presets:['@babel/preset-env']
    });

    return {
        filename,
        dependencies,
        code
    }
}

const makeDependenciesGraph = entry => {
    const entryModule = parseModule(entry);
    const graphArray = [entryModule];

    for(let i=0;i<graphArray.length;++i){
        const { dependencies } = graphArray[i];
        Object.keys(dependencies).forEach(filename => {
            graphArray.push(parseModule(dependencies[filename]));
        })
    }

    const graph = {};

    graphArray.forEach(({filename, dependencies, code})=>{
        graph[filename] = {
            dependencies,
            code
        };
    })

    console.log(graph);

    return graph;
}

const generateCode = entry => {
    const graph = JSON.stringify(makeDependenciesGraph(entry));

    return `
    (function(graph){
        function require(filename){
            function localRequire(relativePath){
                return require(graph[filename].dependencies[relativePath]);
            }
            const exports = {};
            (function(require, exports, code){
                eval(code);
            })(localRequire, exports, graph[filename].code)

            return exports;
        }
        
        require('${entry}');
    })(${graph})
    `
};

const code = generateCode(entry);
console.log(code);
