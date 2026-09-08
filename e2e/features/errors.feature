Feature: Error pages

  Scenario: An unknown URL shows the not-found page
    When I visit "/this-page-does-not-exist"
    Then I should see the "Page not found" heading

  # Blocked by a real src/ behaviour, not a test bug — see playwright-bdd-report.md.
  Scenario: A non-existent device id shows the in-shell not-found state with the sidebar intact
    Given I am signed in as "admin"
    When I visit "/devices/does-not-exist"
    Then I should see the "Not found" heading
    And the sidebar should still be visible
