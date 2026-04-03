"soundtouchjs": "^0.3.0"

node -e "const m = require('soundtouchjs'); console.log(Object.keys(m))"
>> 
[
  'AbstractFifoSamplePipe',
  'PitchShifter',
  'RateTransposer',
  'SimpleFilter',
  'SoundTouch',
  'Stretch',
  'WebAudioBufferSource',
  'getWebAudioNode'
]