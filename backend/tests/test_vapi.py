H = {"x-vapi-secret": "test-secret"}
CALL = {"id": "vapi-call-1", "customer": {"number": "+447700900901"}, "phoneNumber": {"number": "+441615550100"}}


async def test_rejects_bad_secret(client):
    r = await client.post("/voice/vapi/events", json={"message": {"type": "assistant-request", "call": CALL}})
    assert r.status_code == 401


async def test_unknown_number(client):
    msg = {"message": {"type": "assistant-request", "call": {**CALL, "phoneNumber": {"number": "+10000000000"}}}}
    assert (await client.post("/voice/vapi/events", json=msg, headers=H)).status_code == 404


async def test_full_vapi_lifecycle(client, auth):
    r = await client.post("/voice/vapi/events", json={"message": {"type": "assistant-request", "call": CALL}}, headers=H)
    a = r.json()["assistant"]
    assert "Brightline" in a["firstMessage"]
    assert "Brightline Plumbing & Heating" in a["model"]["messages"][0]["content"]
    names = {t.get("function", {}).get("name") for t in a["model"]["tools"]}
    assert {"check_availability", "book_appointment", "capture_lead"} <= names

    r = await client.post("/voice/vapi/events", headers=H, json={"message": {
        "type": "tool-calls", "call": CALL,
        "toolCallList": [{"id": "tc1", "function": {"name": "capture_lead",
                                                    "arguments": {"name": "Rita Vapi", "phone": "+447700900901", "reason": "leaky tap"}}}],
    }})
    res = r.json()["results"][0]
    assert res["toolCallId"] == "tc1" and '"success": true' in res["result"]

    r = await client.post("/voice/vapi/events", headers=H, json={"message": {
        "type": "end-of-call-report", "call": CALL, "durationSeconds": 74, "cost": 0.11, "endedReason": "customer-ended-call",
        "artifact": {"recordingUrl": "https://example.com/rec.wav", "messages": [
            {"role": "bot", "message": "Hi, thanks for calling Brightline."},
            {"role": "user", "message": "My kitchen tap is leaking, I'm Rita."},
            {"role": "bot", "message": "I'll pass that to the team."}]},
    }})
    assert r.json()["ok"]
    calls = (await client.get("/calls", params={"q": "Rita"}, headers=auth)).json()["items"]
    assert calls and calls[0]["duration_seconds"] == 74
    detail = (await client.get(f"/calls/{calls[0]['id']}", headers=auth)).json()
    assert detail["recording_url"].endswith("rec.wav")
    assert len(detail["transcript"]) == 3
    assert detail["outcome"] == "UNCONVERTED"
