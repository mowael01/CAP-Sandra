import { Text, ScrollView, View, TouchableOpacity } from "react-native";

import { supabase } from "./(tabs)";
import { useEffect, useState } from "react";

function formatDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0"); // Day with two digits
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Month with two digits
  const year = date.getFullYear(); // Full year

  let hours = date.getHours(); // Get hours
  const minutes = String(date.getMinutes()).padStart(2, "0"); // Get minutes and pad
  const ampm = hours >= 12 ? "PM" : "AM"; // Determine AM/PM

  hours = hours % 12 || 12; // Convert to 12-hour format and handle midnight (0)
  const time = `${hours}:${minutes} ${ampm}`; // Format time as hh:mm AM/PM

  return `${day}/${month}/${year} ${time}`; // Combine date and time
}

export default function TabTwoScreen() {
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState(
    Array.from({ length: 10 }, () => ({
      Buzzer: false,
      CO: 0,
      CH4: 0,
      created_at: "2024-11-01T20:19:26.913204+00:00",
      humi: 0,
      id: 0,
      temp: 0,
    }))
  );
  useEffect(() => {
    const getData = async () => {
      const { data, error } = await supabase
        .from("readings")
        .select()
        .order("created_at", { ascending: false })
        .limit(10);
      console.log(data);
      // @ts-expect-error
      setData(data);
    };
    getData();
  }, []);
  return (
    <ScrollView
      style={{
        paddingTop: 40,
        backgroundColor: "black",
      }}>
      <View>
        {data.map((item, index) => (
          <View
            key={index}
            style={{
              backgroundColor: "white",
              height: 75,
              width: 350,
              alignItems: "center",
              justifyContent: "space-around",
              borderRadius: 20,
              marginHorizontal: "auto",
              marginBottom: 20,
            }}>
            <Text
              style={{
                color: "black",
                fontSize: 20,
              }}>
              {formatDate(new Date(item.created_at))}
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-evenly",
                alignItems: "center",
                width: "100%",
              }}>
              <Text
                style={{
                  color: "black",
                }}>
                T: {item.temp}°C
              </Text>
              <Text
                style={{
                  color: "black",
                }}>
                H: {item.humi} %
              </Text>
              <Text
                style={{
                  color: "black",
                }}>
                CO: {item.CO} ppm
              </Text>
              <Text
                style={{
                  color: "black",
                }}>
                CH4: {item.CH4} ppm
              </Text>
            </View>
          </View>
        ))}

        <View>
          <TouchableOpacity
            style={{
              alignItems: "center",
              width: 150,
              // height: 20,
              padding: 10,
              backgroundColor: "#D9D9D9",
              marginHorizontal: "auto",
              borderRadius: 20,
            }}
            onPress={async () => {
              const getData = async () => {
                setLimit(limit + 10);
                const { data, error } = await supabase
                  .from("readings")
                  .select()
                  .order("created_at", { ascending: false })
                  .limit(limit);
                console.log(data);
                // @ts-expect-error
                setData(data);
              };
              getData();
            }}>
            <Text
              style={{
                color: "black",
                fontSize: 16,
              }}>
              Load More...
            </Text>
          </TouchableOpacity>{" "}
        </View>
      </View>
      <View style={{ height: 50 }}></View>
    </ScrollView>
  );
}
