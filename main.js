const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default; 
const babel = require('@babel/core');
const options = require('./mini-webpack.config');

class MiniWebpack{
    constructor(options){
        this.options = options;
    }

    parse = filename => {
        // 读取文件
        const fileBuffer = fs.readFileSync(filename, 'utf-8');
        // 转换成抽象语法树
        const ast = parser.parse(fileBuffer, { sourceType: 'module' });

        const dependencies = {};
        // 遍历抽象语法树
        traverse(ast, {
            // 处理ImportDeclaration节点
            ImportDeclaration({node}){
                const dirname = path.dirname(filename);
                const newDirname = './' + path.join(dirname, node.source.value).replace('\\', '/');
                dependencies[node.source.value] = newDirname;
            }
        })
        // 将抽象语法树转换成代码
        const { code } = babel.transformFromAst(ast, null, {
            presets:['@babel/preset-env']
        });
        
        return {
            filename,
            dependencies,
            code
        }
    }

    analyse = entry => {
        // 解析入口文件
        const entryModule = this.parse(entry);
        const graphArray = [entryModule];
        // 循环解析模块，保存信息
        for(let i=0;i<graphArray.length;++i){
            const { dependencies } = graphArray[i];
            Object.keys(dependencies).forEach(filename => {
                graphArray.push(this.parse(dependencies[filename]));
            })
        }

        const graph = {};
        // 生成依赖图谱对象
        graphArray.forEach(({filename, dependencies, code})=>{
            graph[filename] = {
                dependencies,
                code
            };
        })

        return graph;
    }

    generate = (graph, entry) => {
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
    }

    fileOutput = (output, code) => {
        const { path: dirPath, filename } = output;
        const outputPath = path.join(dirPath, filename);


        // 如果没有文件夹的话，生成文件夹
        if(!fs.existsSync(dirPath)){
            fs.mkdirSync(dirPath)
        }
        // 写入文件中
        fs.writeFileSync(outputPath, code, 'utf-8');
    }

    run = () => {
        const { entry, output } = this.options;
        const graph = this.analyse(entry);
        // stringify一下依赖图谱对象，防止在模板字符串中调用toString()返回[object Object]
        const graphStr = JSON.stringify(graph);
        const code = this.generate(graphStr, entry);
        this.fileOutput(output, code);
    }
}

const miniWebpack = new MiniWebpack(options);
miniWebpack.run();

