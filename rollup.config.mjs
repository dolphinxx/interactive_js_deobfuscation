import {readFileSync} from 'fs';
import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import html from '@rollup/plugin-html';
import postcss from "rollup-plugin-postcss";
import del from 'rollup-plugin-delete';

export default {
    input: 'src/main.ts',
    plugins: [
        del({targets: 'dist/*'}),
        nodeResolve(),
        commonjs(),
        typescript(),
        postcss({
            extract: true,
            modules: false,
            sourceMap: true,
            use: [
                'sass'
            ],
        }),
        html({
            template: ({attributes, files, meta, publicPath, title}) => {
                const makeHtmlAttributes = (attributes) => {
                    if (!attributes) {
                        return '';
                    }
                    const keys = Object.keys(attributes);
                    // eslint-disable-next-line no-param-reassign
                    return keys.reduce((result, key) => (result += ` ${key}="${attributes[key]}"`), '');
                };
                const scripts = (files.js || [])
                    .map(({fileName}) => {
                        const attrs = makeHtmlAttributes(attributes.script);
                        return `<script src="${publicPath}${fileName}"${attrs}></script>`;
                    })
                    .join('\n');
                const links = (files.css || [])
                    .map(({fileName}) => {
                        const attrs = makeHtmlAttributes(attributes.link);
                        return `<link href="${publicPath}${fileName}" rel="stylesheet"${attrs}>`;
                    })
                    .join('\n');
                return readFileSync('./public/index.html', {encoding: 'utf-8'})
                    .replace('${scripts}', scripts)
                    .replace('${links}', links);
            },
        }),
    ],
    output: {
        dir: 'dist',
        format: 'es',
        sourcemap: true,
        assetFileNames: '[name]-[hash][extname]',
        entryFileNames: '[name]-[hash].js',
    }
};
