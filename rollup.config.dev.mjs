import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

import baseConfig from './rollup.config.mjs';

const config = {
    ...baseConfig
}
config.plugins.shift();
config.plugins.push(serve('dist'), livereload('dist'), {
    name: 'watch-external',
    buildStart(){
        this.addWatchFile('public/index.html')
    }
});
config.output.assetFileNames = '[name][extname]';
config.output.entryFileNames = '[name].js';

export default config;
