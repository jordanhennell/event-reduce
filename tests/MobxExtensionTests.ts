import { autorun } from "mobx";
import { describe, test, then, when, it } from "wattle";
import { events, reduced } from "../src/mobx";
import { reduce } from "../src/reduction";
import { event } from "./../src/events";
import './setup';

describe("reduced decorator", function () {
    let increment = event();
    class TestModel {
        @reduced
        property = reduce(1)
            .on(increment, c => c + 1)
            .value;
    }
    let model = new TestModel();

    let result = [] as number[];
    autorun(() => result.push(model.property));

    test("property has initial value", () => model.property.should.equal(1));

    test("mobx observable provides value", () => result.should.have.members([1]));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => model.property.should.equal(2));

        then("mobx observable updated", () => result.should.have.members([1, 2]));
    });

    when("reducer creates a new model", () => {
        let createChild = event()
        class Parent {
            @reduced
            child = reduce(null as TestModel | null)
                .on(createChild, () => new TestModel())
                .value;
        }

        let parentModel = new Parent();

        it("doesn't throw", () => {
            createChild();
            parentModel.child!.should.be.an.instanceof(TestModel);
        })
    });
});

describe("actions decorator", function () {
    @events
    class TestActions { someAction = event(); }
    let result = new TestActions();

    test("property is a mobx action", () => {
        (result.someAction as any).isMobxAction.should.equal(true);
    });
});