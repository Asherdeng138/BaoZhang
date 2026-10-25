const fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
(async()=>{const root=path.resolve(__dirname,'..');await fs.mkdir(path.join(root,'vendor'),{recursive:true});
await esbuild.build({entryPoints:[path.join(root,'ui','app.src.js')],bundle:true,format:'iife',platform:'browser',target:'chrome140',outfile:path.join(root,'ui','app.js'),minify:false});
await esbuild.build({entryPoints:[path.join(root,'ui','viewer.src.js')],bundle:true,format:'iife',platform:'browser',target:'chrome140',outfile:path.join(root,'ui','viewer.bundle.js'),minify:false});
await fs.copyFile(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),path.join(root,'vendor','pdf.worker.min.mjs'));
for(const dir of ['cmaps','standard_fonts','wasm'])await fs.cp(path.join(root,'node_modules','pdfjs-dist',dir),path.join(root,'vendor',dir),{recursive:true});
console.log('Desktop HTML interface built.');
})().catch(e=>{console.error(e);process.exit(1)});
