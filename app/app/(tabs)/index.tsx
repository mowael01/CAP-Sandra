import { Platform, ScrollView, StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";

import * as Progress from "react-native-progress";
import { useEffect, useRef, useState } from "react";
import { Bar, CartesianChart } from "victory-native";

import { useFont } from "@shopify/react-native-skia";

import { createClient } from "@supabase/supabase-js";

import { GasesBreakpoints } from "@/constants/GasesData";

import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

// a function to calculate tehe air quality index

function calculateSubIndex(
  Cp: number,
  BPLo: number,
  BPHi: number,
  ILo: number,
  IHi: number
) {
  /**
   * Cp: Truncated concentration of pollutant
   * BPLo: Lower concentration breakpoint ≤ Cp
   * BPHi: Higher concentration breakpoint ≥ Cp
   * ILo: AQI value corresponding to BPLo
   * IHi: AQI value corresponding to BPHi
   */
  return ((IHi - ILo) / (BPHi - BPLo)) * (Cp - BPLo) + ILo;
}

function calculateAQI(
  gasData: { name: string; concentration: number }[],
  breakpoints: {
    [x: string]: any;
    CO?: { BPLo: number; BPHi: number; ILo: number; IHi: number }[];
    NO2?: { BPLo: number; BPHi: number; ILo: number; IHi: number }[];
  }
) {
  /**
   * gasData: Array of pollutant concentration values.
   * Example:
   * [
   *   { name: "CO", concentration: 3.2 }, // in ppm
   *   { name: "NO2", concentration: 0.15 } // in ppm
   * ]
   *
   * breakpoints: Object with breakpoints for each pollutant.
   * Example:
   * {
   *   CO: [
   *     { BPLo: 0, BPHi: 4.4, ILo: 0, IHi: 50 },
   *     { BPLo: 4.5, BPHi: 9.4, ILo: 51, IHi: 100 },
   *     ...
   *   ],
   *   NO2: [
   *     { BPLo: 0, BPHi: 0.05, ILo: 0, IHi: 50 },
   *     { BPLo: 0.06, BPHi: 0.1, ILo: 51, IHi: 100 },
   *     ...
   *   ]
   * }
   */

  let maxAQI = 0;

  gasData.forEach((gas: { name: string; concentration: number }) => {
    const gasBreakpoints = breakpoints[gas.name];
    if (gasBreakpoints) {
      for (let i = 0; i < gasBreakpoints.length; i++) {
        const { BPLo, BPHi, ILo, IHi } = gasBreakpoints[i];
        if (gas.concentration >= BPLo && gas.concentration <= BPHi) {
          const subIndex = calculateSubIndex(
            gas.concentration,
            BPLo,
            BPHi,
            ILo,
            IHi
          );
          maxAQI = Math.max(maxAQI, subIndex);
          break;
        }
      }
    }
  });

  return +maxAQI.toFixed(2);
}

function getAirQualityCategory(aqi: number) {
  if (aqi >= 0 && aqi <= 50) {
    return "Good: Air quality is satisfactory, and there is little or no risk.";
  } else if (aqi > 50 && aqi <= 100) {
    return "Moderate: Air quality is acceptable; some pollutants may affect sensitive individuals.";
  } else if (aqi > 100 && aqi <= 150) {
    return "Unhealthy for Sensitive Groups: Sensitive people may experience health effects.";
  } else if (aqi > 150 && aqi <= 200) {
    return "Unhealthy: Everyone may begin to experience health effects; sensitive groups may face serious effects.";
  } else if (aqi > 200 && aqi <= 300) {
    return "Very Unhealthy: Health alert; everyone may experience serious health effects.";
  } else if (aqi > 300 && aqi <= 500) {
    return "Hazardous: Health warning of emergency conditions; the entire population is likely to be affected.";
  } else {
    return "Invalid AQI: Please provide an AQI value between 0 and 500.";
  }
}

export default function TabOneScreen() {
  const [expoPushToken, setExpoPushToken] = useState("");
  const [channels, setChannels] = useState<Notifications.NotificationChannel[]>(
    []
  );
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >(undefined);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync().then(
      (token) => token && setExpoPushToken(token)
    );

    if (Platform.OS === "android") {
      Notifications.getNotificationChannelsAsync().then((value) =>
        setChannels(value ?? [])
      );
    }
    // @ts-expect-error
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        setNotification(notification);
      });
    // @ts-expect-error
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(response);
      });

    return () => {
      notificationListener.current &&
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      responseListener.current &&
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  const [temperature, setTemperature] = useState(0);
  const [airQualityIndex, setAirQualityIndex] = useState(0);
  const [humidity, setHumidity] = useState(0);

  const [maxTemperature, setMaxTemperature] = useState(50);
  const [maxAirQalityIndex, setMaxAirQalityIndex] = useState(200);
  const [maxHumidity, setMaxHumidity] = useState(100);

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

  const [airQualityCategory, setAirQualityCategory] = useState("");

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
            const { data, error }: any = await supabase
              .from("readings")
              .select()
              .order("created_at", { ascending: false })
              .limit(10);
            data?.reverse();
            console.log(data);
            setData(data);
            setAlarmOn(data[data.length - 1]?.Buzzer);
            setTemperature(data[data.length - 1]?.temp);
            setHumidity(data[data.length - 1]?.humi);
            setAirQualityIndex(
              calculateAQI(
                [
                  { name: "CO", concentration: +data[data.length - 1]?.CO },
                  { name: "NO2", concentration: +data[data.length - 1]?.CH4 },
                ],
                GasesBreakpoints
              )
            );
            setAirQualityCategory(getAirQualityCategory(airQualityIndex));

            set100TemperatureReadings((prevReadings) => [
              data[data.length - 1]?.temp,
              ...prevReadings.slice(0, 99),
            ]);
            set100HumidityReadings((prevReadings) => [
              data[data.length - 1]?.humi,
              ...prevReadings.slice(0, 99),
            ]);
            set100COReadings((prevReadings) => [
              data[data.length - 1]?.CO,
              ...prevReadings.slice(0, 99),
            ]);
            set100CH4Readings((prevReadings) => [
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

            if (temperature > maxTemperature * 0.95) {
              schedulePushNotification(
                "High Temperature Alert",
                "High Temperature Detected"
              );
            }
            if (humidity > maxHumidity * 0.95) {
              schedulePushNotification(
                "High Humidity Alert",
                "High Humidity Detected"
              );
            }
            if (airQualityIndex > maxAirQalityIndex * 0.95) {
              schedulePushNotification(
                "Low Air Quality Alert",
                "Low Air Quality Detected"
              );
            }
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
      const { data, error }: any = await supabase
        .from("readings")
        .select()
        .order("created_at", { ascending: false })
        .limit(10);
      data?.reverse();
      console.log(data);
      setData(data);
      setAlarmOn(data[data.length - 1]?.Buzzer);
      setTemperature(data[data.length - 1]?.temp);
      setHumidity(data[data.length - 1]?.humi);
      setAirQualityIndex(
        calculateAQI(
          [
            { name: "CO", concentration: +data[data.length - 1]?.CO },
            { name: "NO2", concentration: +data[data.length - 1]?.CH4 },
          ],
          GasesBreakpoints
        )
      );
      setAirQualityCategory(getAirQualityCategory(airQualityIndex));

      if (temperature > maxTemperature * 0.95) {
        schedulePushNotification(
          "High Temperature Alert",
          "High Temperature Detected"
        );
      }
      if (humidity > maxHumidity * 0.95) {
        schedulePushNotification(
          "High Humidity Alert",
          "High Humidity Detected"
        );
      }
      if (airQualityIndex > maxAirQalityIndex * 0.95) {
        schedulePushNotification(
          "Low Air Quality Alert",
          "Low Air Quality Detected"
        );
      }
    };
    getData();
  }, []);

  // Get the last 100 readings

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

  useEffect(() => {
    const getData = async () => {
      const { data, error }: any = await supabase
        .from("settings")
        .select()
        .eq("id", 1);
      console.log(data);

      setMaxTemperature(data[0]?.temperature_threshold);
      setMaxAirQalityIndex(data[0]?.AQI_threshold);
      setMaxHumidity(data[0]?.humidity_threshold);
    };
    getData();
  }, []);

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
              Expected next reading:{" "}
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
            height: 200,
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
              {airQualityCategory}
            </Text>
            <Text>
              Current reading:{" "}
              <Text
                style={{
                  color: getColor(airQualityIndex, maxAirQalityIndex),
                }}>
                {airQualityIndex}
              </Text>
            </Text>
            <Text>
              expected next reading:{" "}
              <Text
                style={{
                  color: getColor(airQualityIndex, maxAirQalityIndex),
                }}>
                {calculateAQI(
                  [
                    { name: "CO", concentration: +expectedCO },
                    { name: "CH4", concentration: +expectedCH4 },
                  ],
                  GasesBreakpoints
                )}
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
            domain={{ x: [1, 9], y: [0, 50] }}
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
            domain={{ x: [1, 9], y: [0, 100] }}
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

async function schedulePushNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: body,
      data: { data: "goes here", test: { test1: "more data" } },
    },
    trigger: null,
  });
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (true) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      alert("Failed to get push token for push notification!");
      return;
    }
    // Learn more about projectId:
    // https://docs.expo.dev/push-notifications/push-notifications-setup/#configure-projectid
    // EAS projectId is used here.
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) {
        throw new Error("Project ID not found");
      }
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log(token);
    } catch (e) {
      token = `${e}`;
    }
  } else {
    alert("Must use physical device for Push Notifications");
  }

  return token;
}
