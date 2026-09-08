Feature: Live MQTT telemetry
  As an operator watching the fleet
  I want the dashboard and device list to update the moment a message arrives
  So that I am looking at live status, not a stale page

  Scenario: A telemetry reading updates the dashboard panel live
    Given I am signed in as "admin"
    When a telemetry reading of "22.5°C" arrives for device "Line Sensor 1"
    Then the dashboard should show a temperature of "22.5°C" for device "Line Sensor 1"

  Scenario: A device shows online once its status arrives, scoped to its own row
    Given I am signed in as "admin"
    When device "Line Sensor 1" comes online
    And I am on the "Devices" page
    Then the "Line Sensor 1" device row should show "online"
