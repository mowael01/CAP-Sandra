// ESP32 Code for capstone 2024 G12

#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <DHT_U.h>
#include <Arduino.h>
#include <MQUnifiedsensor.h>
#include <WiFi.h>
#include <ESPSupabase.h>

// Put your supabase URL and Anon key here...
String supabase_url = "https://ngzhzlfxjxkyladhvcop.supabase.co";
String anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nemh6bGZ4anhreWxhZGh2Y29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEzMzE2NzQsImV4cCI6MjA0NjkwNzY3NH0.wdvjm_Iaj7xIphja6G5cjsYkTmueZ6WBRnwSVSUWaPQ";
String table = "readings";
String JSON = "";

Supabase db;

bool upsert = false;
float temperature = 0.0,
      humidity = 0.0,
      CO = 0.0,
      CH4 = 0.0;
bool buzzer = false;
// Wifi credentials
const char *ssid = "Etisalat 4G Router-2629";
const char *password = "2vh2nr68";

#define DHTPIN 4 // Digital pin connected to the DHT sensor

#define DHTTYPE DHT11 // DHT 11

DHT_Unified dht(DHTPIN, DHTTYPE); // Initialize DHT sensor
sensors_event_t event;            // used by the DHT

#define Board ("ESP-32") // Wemos ESP-32 or other board, whatever have ESP32 core.
#define Pin1 (34)        // IO25 for your ESP32 WeMos Board, pinout here: https://i.pinimg.com/originals/66/9a/61/669a618d9435c702f4b67e12c40a11b8.jpg
#define Pin2 (35)
#define Type1 ("MQ-7") // MQ3 or other MQ Sensor, if change this verify your a and b values.
#define Type2 ("MQ-4") // MQ3 or other MQ Sensor, if change this verify your a and b values.

#define Voltage_Resolution (3.3) // 3V3 <- IMPORTANT. Source: https://randomnerdtutorials.com/esp32-adc-analog-read-arduino-ide/
#define ADC_Bit_Resolution (12)  // ESP-32 bit resolution. Source: https://randomnerdtutorials.com/esp32-adc-analog-read-arduino-ide/
#define RatioMQ4CleanAir (4.4)   // RS / R0 = 60 ppm
#define RatioMQ7CleanAir 27.5    // RS / R0 = 27.5 ppm
MQUnifiedsensor MQ7(Board, Voltage_Resolution, ADC_Bit_Resolution, Pin1, Type1);

MQUnifiedsensor MQ4(Board, Voltage_Resolution, ADC_Bit_Resolution, Pin2, Type2);

// thresholds
#define CO_THRESHOLD 3
#define CH4_THRESHOLD 200
#define HUMIDITY_THRESHOLD 60
#define TEMPERATURE_THRESHOLD 30

bool exceedings[4] = {false, false, false, false};

// buzzer
#define BUZZER_PIN 22

// LEDS
#define whiteLED 19  // CH4 LED
#define greenLED 15  // Humidity LED
#define blueLED 5    // CO LED
#define yellowLED 18 // temperature LED

#define ESP_LED_PIN 2

unsigned long currentMillis = millis();

float readTemperature()
{
  dht.temperature().getEvent(&event);
  if (isnan(event.temperature))
  {
    Serial.println(F("Error reading temperature!"));
  }
  else
  {
    Serial.print(F("Temperature: "));
    Serial.print(event.temperature);
    Serial.println(F("C"));
  }
  return event.temperature;
}
float readHumidity()
{
  // Get humidity event and print its value.
  dht.humidity().getEvent(&event);
  if (isnan(event.relative_humidity))
  {
    Serial.println(F("Error reading humidity!"));
  }
  else
  {
    Serial.print(F("Humidity: "));
    Serial.print(event.relative_humidity);
    Serial.println(F("%"));
  }
  return event.relative_humidity;
}

float readCO()
{
  MQ7.update();            // Update data, the arduino will read the voltage from the analog pin
  return MQ7.readSensor(); // Sensor will read PPM concentration using the model, a and b values set previously or from the setup
}

float readCH4()
{
  MQ4.update();            // Update data, the arduino will read the voltage from the analog pin
  return MQ4.readSensor(); // Sensor will read PPM concentration using the model, a and b values set previously or from the setup
}

void setup()
{
  // Initializing serial to communicate with the computer
  Serial.begin(115200);

  // Initialize DHT
  dht.begin();

  // Initialize LEDs
  pinMode(whiteLED, OUTPUT);
  pinMode(greenLED, OUTPUT);
  pinMode(blueLED, OUTPUT);
  pinMode(yellowLED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  pinMode(ESP_LED_PIN, OUTPUT);

  // initialize MQ pins
  pinMode(Pin1, INPUT);
  pinMode(Pin2, INPUT);

  // Set math model to calculate the PPM concentration and the value of constants
  MQ4.setRegressionMethod(1); //_PPM =  a*ratio^b
  MQ4.setA(1012.7);
  MQ4.setB(-2.786); // Configure the MQ4 equation to to calculate CH4 concentration

  MQ7.setRegressionMethod(1); //_PPM =  a*ratio^b
  MQ7.setA(99.042);
  MQ7.setB(-1.518); // Configure the equation to calculate CO concentration value

  // initialize the MQs
  MQ4.init();
  MQ7.init();

  /*****************************  MQ CAlibration ********************************************/
  // Explanation:
  // In this routine the sensor will measure the resistance of the sensor supposedly before being pre-heated
  // and on clean air (Calibration conditions), setting up R0 value.
  // We recomend executing this routine only on setup in laboratory conditions.
  // This routine does not need to be executed on each restart, you can load your R0 value from eeprom.
  // Acknowledgements: https://jayconsystems.com/blog/understanding-a-gas-sensor
  Serial.print("Calibrating MQ4 please wait.");
  float calcR0 = 0;
  for (int i = 1; i <= 10; i++)
  {
    MQ4.update(); // Update data, the arduino will read the voltage from the analog pin
    calcR0 += MQ4.calibrate(RatioMQ4CleanAir);
    Serial.print(".");
  }
  MQ4.setR0(calcR0 / 10);
  Serial.println("  done!.");

  if (isinf(calcR0))
  {
    Serial.println("Warning: Conection issue, R0 is infinite (Open circuit detected) please check your wiring and supply");
    while (1)
      ;
  }
  if (calcR0 == 0)
  {
    Serial.println("Warning: Conection issue found, R0 is zero (Analog pin shorts to ground) please check your wiring and supply");
    while (1)
      ;
  }

  Serial.print("Calibrating MQ7 please wait.");
  calcR0 = 0;
  for (int i = 1; i <= 10; i++)
  {
    MQ7.update(); // Update data, the arduino will read the voltage from the analog pin
    calcR0 += MQ7.calibrate(RatioMQ7CleanAir);
    Serial.print(".");
  }
  MQ7.setR0(calcR0 / 10);
  Serial.println("  done!.");

  if (isinf(calcR0))
  {
    Serial.println("Warning: Conection issue, R0 is infinite (Open circuit detected) please check your wiring and supply");
    while (1)
      ;
  }
  if (calcR0 == 0)
  {
    Serial.println("Warning: Conection issue found, R0 is zero (Analog pin shorts to ground) please check your wiring and supply");
    while (1)
      ;
  }
  /*****************************  MQ CAlibration ********************************************/

  // Initialize WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(1000);
    Serial.println("Connecting to WiFi..");
  }
  Serial.println("Connected to the WiFi network");

  // initialize Supabase
  db.begin(supabase_url, anon_key);

  // all done here
  digitalWrite(ESP_LED_PIN, HIGH);
}

bool checkLEDs()
{
  if (temperature > TEMPERATURE_THRESHOLD)
  {
    digitalWrite(yellowLED, HIGH);
    exceedings[0] = true;
  }
  else
  {
    digitalWrite(yellowLED, LOW);
    exceedings[0] = false;
  }

  if (humidity > HUMIDITY_THRESHOLD)
  {
    digitalWrite(greenLED, HIGH);
    exceedings[1] = true;
  }
  else
  {
    digitalWrite(greenLED, LOW);
    exceedings[1] = false;
  }

  if (CO > CO_THRESHOLD)
  {
    digitalWrite(blueLED, HIGH);
    exceedings[2] = true;
  }
  else
  {
    digitalWrite(blueLED, LOW);
    exceedings[2] = false;
  }

  if (CH4 > CH4_THRESHOLD)
  {
    digitalWrite(whiteLED, HIGH);
    exceedings[3] = true;
  }
  else
  {
    digitalWrite(whiteLED, LOW);
    exceedings[3] = false;
  }

  for (int i = 0; i < 4; i++)
  {
    if (exceedings[i])
    {
      digitalWrite(BUZZER_PIN, HIGH);
      return true;
    }
    else
    {
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
  return false;
}

void loop()
{

  if (millis() - currentMillis >= 5000 || currentMillis == 0)
  {
    currentMillis = millis();
    // Get temperature and humidity
    temperature = readTemperature();
    humidity = readHumidity();
    // get gas concentrations
    CO = readCO();
    CH4 = readCH4();

    buzzer = checkLEDs();

    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.print("C, Humidity: ");
    Serial.print(humidity);
    Serial.print("%, CO: ");
    Serial.print(CO);
    Serial.print("ppm");
    Serial.print(", CH4: ");
    Serial.print(CH4);
    Serial.println("ppm");

    JSON = "{\"temp\":";
    JSON += temperature;
    JSON += ",\"humi\":";
    JSON += humidity;
    JSON += ",\"CO\":";
    JSON += CO;
    JSON += ",\"CH4\":";
    JSON += CH4;
    JSON += ",\"buzzer\":";
    JSON += buzzer;
    JSON += "}";
    int code = db.insert(table, JSON, upsert);
    Serial.println(code);
    db.urlQuery_reset();
  }
  delay(100);
}
