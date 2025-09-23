import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { mergeOpenAPISpecs, ServerUrlStrategy } from './merger';

async function run(): Promise<void> {
  try {
    // Get inputs
    const inputFiles = core.getInput('input_files', { required: true });
    const outputPath = core.getInput('output_path') || './merged-openapi.yaml';
    const serverStrategyInput = core.getInput('server_url_strategy');

    core.info(`Input patterns: ${inputFiles}`);
    core.info(`Output path: ${outputPath}`);

    // Parse server URL strategy if provided
    let serverStrategy: ServerUrlStrategy | undefined;
    if (serverStrategyInput) {
      try {
        serverStrategy = yaml.load(serverStrategyInput) as ServerUrlStrategy;
        core.info(`Server URL strategy: ${JSON.stringify(serverStrategy)}`);
      } catch (error) {
        throw new Error(`Failed to parse server_url_strategy YAML: ${error}`);
      }
    }

    // Merge specs
    const result = await mergeOpenAPISpecs(inputFiles, outputPath, serverStrategy);

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
