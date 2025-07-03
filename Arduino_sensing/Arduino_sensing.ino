// Implementation of
// Touché: Enhancing Touch Interaction on Humans, Screens, Liquids, and Everyday Objects
// by Dzl (2012), slightly cleaned up by Gohai (2025)


//                               10n
//  PIN 9 --[10k]-+-----10mH---+--||-- OBJECT
//                |            |
//               3.3k          |
//                |            V 1N4148 diode
//               GND           |
//                             |
// Analog 0 ---+------+--------+
//            |      |
//          100pf   1MOmhm
//            |      |
//           GND    GND


#define N 160      // Number of frequencies
float results[N];  // Filtered result buffer

#define SET(x, y) (x |= (1 << y))
#define CLR(x, y) (x &= (~(1 << y)))


void setup() {
  // Setup frequency generator
  TCCR1A = 0b10000010;
  TCCR1B = 0b00011001;
  ICR1 = 110;
  OCR1A = 55;

  // Signal generator pin
  pinMode(9, OUTPUT);

  Serial.begin(115200);

  // Zero results array
  for (uint8_t i = 0; i < N; i++) {
    results[i] = 0;
  }
}

void loop() {
  for (uint8_t d = 0; d < N; d++) {
    uint16_t v = analogRead(0);  // Read response signal
    CLR(TCCR1B, 0);              // Stop generator
    TCNT1 = 0;                   // Update frequency
    ICR1 = d;                    //
    OCR1A = d / 2;               //
    SET(TCCR1B, 0);              // Restart generator

    results[d] = results[d] * 0.5f + (float)(v)*0.5f;  // Filter results
  }

  for (uint8_t i = 0; i < N; i++) {
    uint16_t out = (uint16_t)results[i];
    uint8_t high = out >> 7;  // high 3 bits
    if (i == 0) {
      high |= (1 << 7);  // marker for beginning of frame
    }
    uint8_t low = out & 0x7f;  // low 7 bits
    Serial.write(high);
    Serial.write(low);
  }
}
