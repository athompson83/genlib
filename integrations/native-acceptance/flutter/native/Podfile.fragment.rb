# SPDX-License-Identifier: Apache-2.0
# Inside the generated Runner target, after adding RunnerUITests in Xcode:
target 'RunnerUITests' do
  inherit! :complete
end

# In the existing post_install loop, after flutter_additional_ios_build_settings(target):
# target.build_configurations.each do |config|
#   config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
#   config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'PERMISSION_CAMERA=1'
# end
