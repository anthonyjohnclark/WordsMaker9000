import {
  prepareAndPublishProject,
  type PublishPreparationDependencies,
} from "./publishPreparation";
import type { PublishRequest } from "../types/PublishingTypes";

const request: PublishRequest = {
  export_id: "13540878-e90d-4c46-95c2-c41052715938",
  project_name: "Draft",
  project_type: "novel",
  scope: { type: "full_project" },
  format: "docx",
  profile_id: "standard_manuscript",
  metadata: {
    title: "Book",
    author: "A. Writer",
    contact: {
      author_name: "A. Writer",
      email: "",
      phone: "",
      mailing_address: "",
      header_surname: "Writer",
      short_title: "Book",
    },
    ebook: {
      include_front_matter: true,
      include_back_matter: true,
    },
  },
  node_overrides: {},
  outline_confirmed: true,
  include_shared_matter: true,
};

describe("prepareAndPublishProject", () => {
  test("flushes the complete project snapshot before invoking Rust", async () => {
    const events: string[] = [];
    const flushProjectSnapshot = jest.fn(async () => {
      events.push("flush");
    });
    const publishProject: PublishPreparationDependencies["publishProject"] =
      jest.fn(async () => {
        events.push("publish");
        return {
          export_id: request.export_id,
          manifest_path: "manifest.json",
          primary_artifact_path: "Book.docx",
          diagnostics: [],
        };
      });

    await prepareAndPublishProject(
      { request, flushProjectSnapshot },
      { publishProject },
    );

    expect(events).toEqual(["flush", "publish"]);
    expect(publishProject).toHaveBeenCalledWith(request);
  });

  test("does not invoke Rust after a snapshot failure", async () => {
    const publishProject = jest.fn();

    await expect(
      prepareAndPublishProject(
        {
          request,
          flushProjectSnapshot: jest.fn(async () => {
            throw new Error("metadata write failed");
          }),
        },
        { publishProject },
      ),
    ).rejects.toThrow("metadata write failed");

    expect(publishProject).not.toHaveBeenCalled();
  });
});
