import * as core from '@actions/core';
import { mergeOpenAPISpecs } from './merger';

async function run(): Promise<void> {
  try {
    // Get inputs
    const inputFiles = core.getInput('input_files', { required: true });
    const outputPath = core.getInput('output_path') || './merged-openapi.yaml';

    core.info(`Input patterns: ${inputFiles}`);
    core.info(`Output path: ${outputPath}`);

    // Merge specs
    const result = await mergeOpenAPISpecs(inputFiles, outputPath);

    core.info(`Total paths before merge: ${result.pathCountBefore}`);
    core.info(`Total paths after merge: ${result.pathCountAfter}`);

    if (result.pathCountAfter !== result.pathCountBefore) {
      core.warning(
        `Path count mismatch (before: ${result.pathCountBefore}, after: ${result.pathCountAfter})`,
      );
      core.warning('Some paths may have been overwritten during merge.');
    }

    // Set outputs
    core.setOutput('merged_file', outputPath);
    core.setOutput('path_count', result.pathCountAfter.toString());

    core.info(`✅ Merge completed successfully!`);
    core.info(`Output file: ${outputPath}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Run the action
run();
