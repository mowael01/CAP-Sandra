import { ScrollView, StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";

import * as Progress from "react-native-progress";
import { useEffect, useState } from "react";
import { Bar, CartesianChart } from "victory-native";

import { useFont } from "@shopify/react-native-skia";

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://ngzhzlfxjxkyladhvcop.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nemh6bGZ4anhreWxhZGh2Y29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEzMzE2NzQsImV4cCI6MjA0NjkwNzY3NH0.wdvjm_Iaj7xIphja6G5cjsYkTmueZ6WBRnwSVSUWaPQ"
);

// Exponential Smoothing Function
const exponentialSmoothing = (data: number[], alpha = 0.2) => {
  let forecast = data[0]; // Start with the first value in the series
  // Loop through the data from the second value onwards
  for (let i = 1; i < data.length; i++) {
    forecast = alpha * data[i] + (1 - alpha) * forecast;
  }
  return forecast;
};

// Function to predict the next value based on the latest 100 readings
const predictWithExponentialSmoothing = (latestReadings: number[]) => {
  if (latestReadings.length < 100) {
    console.error("Insufficient data. Please provide at least 100 readings.");
    return null;
  }

  // Use the latest 100 readings for prediction
  const readings = latestReadings.slice(-100);

  // Calculate the predicted value using Exponential Smoothing
  const predictedValue = exponentialSmoothing(readings);

  return predictedValue.toFixed(2);
};

// Calculate color gradient from blue to red
const getColor = (current: number, max: number) => {
  const red = Math.min(255, (current / max) * 255);
  const blue = Math.max(0, 255 - (current / max) * 255);
  return `rgb(${red}, 0, ${blue})`; // Gradually turns redder as temperature rises
};

export default function TabOneScreen() {
  const [temperature, setTemperature] = useState(0);
  const [airQualityIndex, setAirQualityIndex] = useState(0);
  const [humidity, setHumidity] = useState(0);

  const maxTemperature = 50;
  const maxAirQalityIndex = 100;
  const maxHumidity = 100;
  const maxCO = 100;
  const maxCH4 = 100;

  const [_100TemperatureReadings, set100TemperatureReadings] = useState<
    number[]
  >([0]);
  const [_100HumidityReadings, set100HumidityReadings] = useState<number[]>([
    0,
  ]);
  const [_100COReadings, set100COReadings] = useState<number[]>([0]);
  const [_100CH4Readings, set100CH4Readings] = useState<number[]>([0]);

  const [expectedTemperature, setExpectedTemperature] = useState<number>(0);
  const [expectedHumidity, setExpectedHumidity] = useState<number>(0);

  const [expectedCO, setExpectedCO] = useState<number>(0);
  const [expectedCH4, setExpectedCH4] = useState<number>(0);

  const [data, setData] = useState([
    {
      Buzzer: false,
      CO: 0,
      CH4: 0,
      created_at: "2024-11-01T20:19:26.913204+00:00",
      humi: 0,
      id: 0,
      temp: 0,
    },
  ]);

  const [alarmOn, setAlarmOn] = useState(false);

  const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 10);

  useEffect(() => {
    const subscription = supabase
      .channel("changes2") // name your channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "readings" },
        (payload) => {
          const getData = async () => {
            const { data, error } = await supabase
              .from("readings")
              .select()
              .order("created_at", { ascending: false })
              .limit(10);
            data?.reverse();
            console.log(data);
            // @ts-expect-error
            setData(data);
            // @ts-expect-error
            setAlarmOn(data[data.length - 1]?.Buzzer);
            // @ts-expect-error
            setTemperature(data[data.length - 1]?.temp);
            // @ts-expect-error
            setHumidity(data[data.length - 1]?.humi);
            setAirQualityIndex(
              // @ts-expect-error
              data[data.length - 1]?.CO + data[data.length - 1]?.CH4
            );

            set100TemperatureReadings((prevReadings) => [
              // @ts-expect-error
              data[data.length - 1]?.temp,
              ...prevReadings.slice(0, 99),
            ]);
            set100HumidityReadings((prevReadings) => [
              // @ts-expect-error
              data[data.length - 1]?.humi,
              ...prevReadings.slice(0, 99),
            ]);
            set100COReadings((prevReadings) => [
              // @ts-expect-error
              data[data.length - 1]?.CO,
              ...prevReadings.slice(0, 99),
            ]);
            set100CH4Readings((prevReadings) => [
              // @ts-expect-error
              data[data.length - 1]?.CH4,
              ...prevReadings.slice(0, 99),
            ]);

            setExpectedTemperature(
              // @ts-expect-error
              predictWithExponentialSmoothing(_100TemperatureReadings)
            );
            console.log("Expected Temperature:", expectedTemperature);
            setExpectedHumidity(
              // @ts-expect-error
              predictWithExponentialSmoothing(_100HumidityReadings)
            );
            console.log("Expected Humidity:", expectedHumidity);
            setExpectedCO(
              // @ts-expect-error
              predictWithExponentialSmoothing(_100COReadings)
            );
            console.log("Expected CO:", expectedCO);
            setExpectedCH4(
              // @ts-expect-error
              predictWithExponentialSmoothing(_100CH4Readings)
            );
            console.log("Expected CH4:", expectedCH4);
          };
          getData();
        }
      )
      .subscribe();

    // Clean up the subscription when component unmounts
    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  useEffect(() => {
    const getData = async () => {
      const { data, error } = await supabase
        .from("readings")
        .select()
        .order("created_at", { ascending: false })
        .limit(10);
      data?.reverse();
      console.log(data);
      // @ts-expect-error
      setData(data);
      // @ts-expect-error
      setAlarmOn(data[data.length - 1]?.Buzzer);
      // @ts-expect-error
      setTemperature(data[data.length - 1]?.temp);
      // @ts-expect-error
      setHumidity(data[data.length - 1]?.humi);
      setAirQualityIndex(
        // @ts-expect-error
        data[data.length - 1]?.CO + data[data.length - 1]?.CH4
      );
    };
    getData();
  }, []);
  useEffect(() => {
    const getData = async () => {
      const { data, error } = await supabase
        .from("readings")
        .select()
        .order("created_at", { ascending: false })
        .limit(101);
      data?.reverse();
      console.log(data);
      // @ts-expect-error
      set100TemperatureReadings(data.map((reading) => reading.temp));

      // @ts-expect-error
      set100HumidityReadings(data?.map((reading) => reading.humi));
      // @ts-expect-error
      set100COReadings(data?.map((reading) => reading.CO));
      // @ts-expect-error
      set100CH4Readings(data?.map((reading) => reading.CH4));

      setExpectedTemperature(
        // @ts-expect-error
        predictWithExponentialSmoothing(_100TemperatureReadings)
      );
      console.log("Expected Temperature:", expectedTemperature);
      setExpectedHumidity(
        // @ts-expect-error
        predictWithExponentialSmoothing(_100HumidityReadings)
      );
      console.log("Expected Humidity:", expectedHumidity);
      setExpectedCO(
        // @ts-expect-error
        predictWithExponentialSmoothing(_100COReadings)
      );
      console.log("Expected CO:", expectedCO);
      setExpectedCH4(
        // @ts-expect-error
        predictWithExponentialSmoothing(_100CH4Readings)
      );
      console.log("Expected CH4:", expectedCH4);
    };
    getData();
  }, [data]);

  return (
    <ScrollView>
      <View
        style={{
          flex: 1,
          backgroundColor: "black",
          padding: 10,
          paddingBottom: 50,
        }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: "white",
            height: 130,
            borderRadius: 10,
            marginBottom: 15,
          }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              marginTop: 10,
              marginBottom: 20,
            }}>
            Temperature:{" "}
            <Text style={{ color: getColor(temperature, maxTemperature) }}>
              {temperature}°C
            </Text>
          </Text>
          <Progress.Bar
            progress={temperature / (maxTemperature + 10)}
            width={300}
            color={getColor(temperature, maxTemperature)}
            height={15}
          />
          <View>
            <Text style={{ fontSize: 15, marginTop: 10, textAlign: "center" }}>
              Temperature is safe
            </Text>
            <Text>
              expected next reading:{" "}
              <Text
                style={{
                  color: getColor(expectedTemperature, maxTemperature),
                }}>
                {expectedTemperature}°C
              </Text>
            </Text>
          </View>
        </View>

        <View
          style={{
            alignItems: "center",
            backgroundColor: "white",
            height: 130,
            borderRadius: 10,
            marginBottom: 15,
          }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              marginTop: 10,
              marginBottom: 20,
            }}>
            Humidity:{" "}
            <Text style={{ color: getColor(humidity, maxHumidity) }}>
              {humidity}%
            </Text>
          </Text>
          <Progress.Bar
            progress={humidity / maxHumidity}
            width={300}
            color={getColor(humidity, maxHumidity)}
            height={15}
          />
          <View>
            <Text style={{ fontSize: 15, marginTop: 10, textAlign: "center" }}>
              Humidity is safe
            </Text>
            <Text>
              expected next reading:{" "}
              <Text
                style={{
                  color: getColor(expectedHumidity, maxHumidity),
                }}>
                {expectedHumidity}%
              </Text>
            </Text>
          </View>
        </View>

        {/* Air quality */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: "white",
            height: 130,
            borderRadius: 10,
            marginBottom: 15,
          }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              marginTop: 10,
              marginBottom: 20,
            }}>
            Air Quality Index
          </Text>
          <Progress.Bar
            progress={airQualityIndex / (maxAirQalityIndex + 10)}
            width={300}
            color={getColor(airQualityIndex, maxAirQalityIndex)}
            height={15}
          />
          <View>
            <Text
              style={{
                fontSize: 15,
                marginTop: 10,
                textAlign: "center",
                maxWidth: 300,
              }}>
              Air quality seems to be safe
            </Text>
            <Text>
              expected next reading:{" "}
              <Text
                style={{
                  color: getColor(
                    +expectedCO + +expectedCH4,
                    maxAirQalityIndex
                  ),
                }}>
                {+expectedCO + +expectedCH4} ppm
              </Text>
            </Text>
          </View>
        </View>
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 15,
            width: "100%",
            height: 300,
            overflow: "hidden",
            marginBottom: 15,
          }}>
          <View>
            <Text
              style={{
                fontSize: 25,
                width: "100%",
                textAlign: "center",
                marginVertical: 5,
                fontWeight: "bold",
              }}>
              CO (ppm)
            </Text>
            <View>
              <Text
                style={{
                  width: "100%",
                  textAlign: "center",
                }}>
                Current Reading: {data[data.length - 1]?.CO} ppm
              </Text>
              <Text style={{ textAlign: "center" }}>
                Expected Reading:{" "}
                <Text
                  style={{
                    color: getColor(expectedCO, maxAirQalityIndex),
                  }}>
                  {expectedCO} ppm
                </Text>
              </Text>
            </View>
          </View>

          <CartesianChart
            data={data}
            frame={{ lineColor: "black" }}
            padding={10}
            domainPadding={{ left: 20, right: 20, top: 0, bottom: 0 }}
            xKey="created_at"
            yKeys={["CO"]}
            domain={{ x: [1, 9], y: [0, 20] }}
            yAxis={[
              {
                font,
                tickCount: 8,
                // tickValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
              },
            ]}>
            {({ points, chartBounds }) => (
              //👇 pass a PointsArray to the Bar component, as well as options.
              <Bar
                points={points.CO}
                chartBounds={chartBounds}
                color="blue"
                barWidth={20}
                roundedCorners={{ topLeft: 10, topRight: 10 }}
              />
            )}
          </CartesianChart>
        </View>
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 15,
            width: "100%",
            height: 300,
            overflow: "hidden",
            marginBottom: 15,
          }}>
          <View>
            <Text
              style={{
                fontSize: 25,
                width: "100%",
                textAlign: "center",
                marginVertical: 5,
                fontWeight: "bold",
              }}>
              Methane (ppm)
            </Text>
            <View>
              <Text
                style={{
                  width: "100%",
                  textAlign: "center",
                }}>
                Current Reading: {data[data.length - 1]?.CH4} ppm
              </Text>
              <Text style={{ textAlign: "center" }}>
                Expected Reading:{" "}
                <Text
                  style={{
                    color: getColor(expectedCH4, maxAirQalityIndex),
                  }}>
                  {expectedCH4} ppm
                </Text>
              </Text>
            </View>
          </View>

          <CartesianChart
            data={data}
            frame={{ lineColor: "black" }}
            padding={10}
            domainPadding={{ left: 20, right: 20, top: 0, bottom: 0 }}
            xKey="created_at"
            yKeys={["CH4"]}
            domain={{ x: [1, 9], y: [0, 20] }}
            yAxis={[
              {
                font,
                tickCount: 8,
                // tickValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
              },
            ]}>
            {({ points, chartBounds }) => (
              //👇 pass a PointsArray to the Bar component, as well as options.
              <Bar
                points={points.CH4}
                chartBounds={chartBounds}
                color="blue"
                barWidth={20}
                roundedCorners={{ topLeft: 10, topRight: 10 }}
              />
            )}
          </CartesianChart>
        </View>
      </View>
    </ScrollView>
  );
}
