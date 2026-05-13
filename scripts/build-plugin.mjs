import {copyFileSync, mkdirSync, existsSync, cpSync, rmSync} from 'node:fs';
import path from 'node:path';
import {build} from 'vite';
import 'dotenv/config';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
// Use environment variable for local deployment path to protect privacy and allow portability
const obsidianPluginDir = process.env.OBSIDIAN_PATH || '';

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');

async function runBuild() {
  await build({
    configFile: path.join(rootDir, 'vite.config.ts'),
    build: {
      watch: isWatch ? {} : null,
    }
  });

  // Helper to copy build artifacts to Obsidian
  const copyToObsidian = () => {
    if (existsSync(obsidianPluginDir)) {
      try {
        copyFileSync(path.join(distDir, 'main.js'), path.join(obsidianPluginDir, 'main.js'));
        copyFileSync(path.join(distDir, 'manifest.json'), path.join(obsidianPluginDir, 'manifest.json'));

        const distAudioDir = path.join(distDir, 'audio');
        const obsAudioDir = path.join(obsidianPluginDir, 'audio');
        if (existsSync(distAudioDir)) {
          if (existsSync(obsAudioDir)) rmSync(obsAudioDir, { recursive: true });
          cpSync(distAudioDir, obsAudioDir, { recursive: true });
        }

        console.log(`\x1b[32mSuccessfully deployed to ${obsidianPluginDir}\x1b[0m`);
      } catch (err) {
        console.error(`\x1b[31mFailed to deploy to Obsidian: ${err.message}\x1b[0m`);
      }
    }
  };

  // initial copy
  mkdirSync(distDir, {recursive: true});
  if (existsSync(path.join(rootDir, 'manifest.json'))) {
    copyFileSync(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
  }
  if (existsSync(path.join(rootDir, 'versions.json'))) {
    copyFileSync(path.join(rootDir, 'versions.json'), path.join(distDir, 'versions.json'));
  }
  
  if (!isWatch) {
    copyToObsidian();
  }
}

runBuild().catch(err => {
  console.error(err);
  process.exit(1);
});
