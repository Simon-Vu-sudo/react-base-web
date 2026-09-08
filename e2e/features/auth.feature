Feature: Authentication
  As a user of the device-management console
  I want to sign in and out of my account
  So that only I can see and act on my organisation's devices

  Scenario: Successful sign-in lands on the dashboard
    Given I am on the login page
    When I sign in with email "admin@example.com" and password "password"
    Then I should be on the dashboard

  Scenario: Wrong password shows a form-level error and stays on the login page
    Given I am on the login page
    When I sign in with email "admin@example.com" and password "wrong-password"
    Then I should see the error message "That email or password is incorrect."
    And I should be on the login page

  Scenario: An invalid email shows a validation message without submitting
    Given I am on the login page
    When I sign in with email "not-an-email" and password "password"
    Then I should see the validation message "Enter a valid email address"
    And I should be on the login page

  Scenario: Deep-linking to a protected page while signed out redirects to login, then returns you there after signing in
    Given I am signed out
    When I visit "/devices"
    Then I should be redirected to the login page
    When I sign in with email "admin@example.com" and password "password"
    Then I should be on "/devices"

  Scenario: Signing out returns to login, and the browser Back button does not restore the app
    Given I am signed in as "admin"
    When I sign out
    Then I should be on the login page
    When I go back in the browser
    Then I should not see the dashboard
