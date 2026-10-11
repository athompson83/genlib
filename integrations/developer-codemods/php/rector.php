<?php
// SPDX-License-Identifier: Apache-2.0
use Rector\Config\RectorConfig;
use Rector\Php74\Rector\Closure\ClosureToArrowFunctionRector;
return RectorConfig::configure()
    ->withPaths([__DIR__ . '/fixtures/before.php'])
    ->withRules([ClosureToArrowFunctionRector::class]);
